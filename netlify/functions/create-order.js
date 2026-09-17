// ---- create-order ----
// Recibe {title, priceUSD, email, externalReference} desde el sitio.
// 1) Consulta el tipo de cambio oficial del BCRP (serie PD04640PD, venta SBS).
// 2) Le suma un margen del 5%.
// 3) Convierte el precio en dólares mostrado en el sitio a soles.
// 4) Crea la orden en Mercado Pago (Orders API) y devuelve el checkout_url.
//
// El precio en dólares NUNCA cambia en el sitio — solo el monto que
// realmente se cobra en soles se ajusta al tipo de cambio del día.

const MARGIN = 1.05; // tipo de cambio oficial + 5%

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const { title, priceUSD, email, externalReference } = payload;

  if (!title || !priceUSD || !email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Faltan datos: title, priceUSD o email' }) };
  }

  try {
    // 1) Tipo de cambio oficial del BCRP (serie diaria, venta SBS)
    const bcrpRes = await fetch('https://estadisticas.bcrp.gob.pe/estadisticas/series/api/PD04640PD/json');
    if (!bcrpRes.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: 'No se pudo consultar el tipo de cambio del BCRP' }) };
    }
    const bcrpData = await bcrpRes.json();
    const periods = bcrpData.periods || [];
    const lastValid = [...periods].reverse().find(
      (p) => p.values && p.values[0] && p.values[0] !== 'n.d.'
    );
    if (!lastValid) {
      return { statusCode: 502, body: JSON.stringify({ error: 'El BCRP no devolvió un tipo de cambio válido' }) };
    }
    const officialRate = parseFloat(lastValid.values[0]);

    // 2) + 5% de margen
    const rate = officialRate * MARGIN;

    // 3) Conversión del precio mostrado (USD) a soles
    const priceUSDNum = parseFloat(priceUSD);
    const totalAmountPEN = (priceUSDNum * rate).toFixed(2);

    // 4) Crear la orden en Mercado Pago
    const idempotencyKey =
      (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const siteUrl = process.env.URL || 'https://petitbox.art';

    const orderPayload = {
      type: 'online',
      processing_mode: 'manual',
      total_amount: totalAmountPEN,
      external_reference: externalReference || `petitbox_${Date.now()}`,
      description: `${title} — US$ ${priceUSDNum.toFixed(2)} al tipo de cambio oficial + 5% (S/ ${rate.toFixed(4)})`,
      payer: { email },
      items: [
        {
          title: title,
          unit_price: totalAmountPEN,
          quantity: 1,
          unit_measure: 'unit',
          total_amount: totalAmountPEN,
        },
      ],
      config: {
        online: {
          success_url: `${siteUrl}/order-received.html`,
          failure_url: `${siteUrl}/order-failed.html`,
          pending_url: `${siteUrl}/order-received.html`,
          auto_return: 'approved',
        },
      },
    };

    const mpRes = await fetch('https://api.mercadopago.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(orderPayload),
    });

    const mpData = await mpRes.json();

    if (!mpRes.ok) {
      return { statusCode: mpRes.status, body: JSON.stringify({ error: mpData }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkout_url: mpData.checkout_url,
        rate_used: rate.toFixed(4),
        total_pen: totalAmountPEN,
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
