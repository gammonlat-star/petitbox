// ---- create-order ----
// Recibe {title, priceUSD, email, fullName, externalReference} desde el sitio.
// 1) Convierte el precio en dólares mostrado en el sitio a soles, usando
//    un tipo de cambio fijo configurable (variable EXCHANGE_RATE_PEN en Netlify).
// 2) Crea la orden en Mercado Pago (Orders API) y devuelve el checkout_url.
//
// El precio en dólares NUNCA cambia en el sitio — solo el monto que
// realmente se cobra en soles depende de este tipo de cambio.

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

  const { title, priceUSD, email, fullName, externalReference } = payload;

  if (!title || !priceUSD || !email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Faltan datos: title, priceUSD o email' }) };
  }

  try {
    // Tipo de cambio: fijo, configurable desde Netlify (variable EXCHANGE_RATE_PEN),
    // sin depender de ninguna API externa. Cambialo ahí cuando quieras ajustar el valor.
    const rate = parseFloat(process.env.EXCHANGE_RATE_PEN || '3.37');

    // Conversión del precio mostrado (USD) a soles
    const priceUSDNum = parseFloat(priceUSD);
    const totalAmountPEN = (priceUSDNum * rate).toFixed(2);

    // Crear la orden en Mercado Pago
    const idempotencyKey =
      (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const siteUrl = process.env.URL || 'https://petitbox.art';

    // Nombre del comprador: se divide en nombre y apellido para el payer de Mercado Pago
    const payer = { email };
    if (fullName && fullName.trim()) {
      const parts = fullName.trim().split(/\s+/);
      payer.first_name = parts[0];
      payer.last_name = parts.slice(1).join(' ') || parts[0];
    }

    const orderPayload = {
      type: 'online',
      processing_mode: 'manual',
      total_amount: totalAmountPEN,
      external_reference: externalReference || `petitbox_${Date.now()}`,
      description: `${title} — US$ ${priceUSDNum.toFixed(2)} (tipo de cambio S/ ${rate.toFixed(2)})`,
      payer,
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
