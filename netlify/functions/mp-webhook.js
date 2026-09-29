// ---- mp-webhook ----
// Mercado Pago llama a esta URL cada vez que una orden cambia de estado.
// 1) Valida que el aviso realmente venga de Mercado Pago (firma HMAC).
// 2) Consulta la orden completa por su id.
// 3) Si el pago quedó aprobado, guarda un registro en Netlify Blobs con
//    la fecha en la que el certificado debe salir: hoy + 14 días.
//
// La función que efectivamente envía el certificado es otra
// (send-certificates.js), que corre sola una vez al día.

const crypto = require('crypto');
const { connectLambda, getStore } = require('@netlify/blobs');

const DAYS_UNTIL_CERTIFICATE = 14;

function verifySignature(xSignature, xRequestId, dataId, secret) {
  if (!xSignature || !secret) return false;
  const parts = xSignature.split(',');
  let ts;
  let hash;
  parts.forEach((part) => {
    const [key, value] = part.split('=');
    if (key && value) {
      const k = key.trim();
      const v = value.trim();
      if (k === 'ts') ts = v;
      if (k === 'v1') hash = v;
    }
  });
  if (!ts || !hash) return false;

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
  } catch (e) {
    return false;
  }
}

function isApproved(order) {
  if (!order) return false;
  if (order.status === 'processed' || order.status === 'paid') return true;
  const payments = order.transactions && order.transactions.payments;
  if (Array.isArray(payments)) {
    return payments.some((p) => p.status === 'approved');
  }
  return false;
}

exports.handler = async (event) => {
  connectLambda(event);

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const query = event.queryStringParameters || {};
  const dataId = query['data.id'] || query.id;
  const xSignature = event.headers['x-signature'] || event.headers['X-Signature'];
  const xRequestId = event.headers['x-request-id'] || event.headers['X-Request-Id'];

  const secret = process.env.MP_WEBHOOK_SECRET;
  const validSignature = verifySignature(xSignature, xRequestId, dataId, secret);

  if (!validSignature) {
    return { statusCode: 401, body: 'Invalid signature' };
  }

  if (!dataId) {
    // Mercado Pago espera un 200 rápido aunque no haya nada que procesar.
    return { statusCode: 200, body: 'ok' };
  }

  try {
    const orderRes = await fetch(`https://api.mercadopago.com/v1/orders/${dataId}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
    });
    const order = await orderRes.json();

    if (!orderRes.ok || !isApproved(order)) {
      // Todavía no está aprobado, o la consulta falló — no hay nada que guardar aún.
      return { statusCode: 200, body: 'ok' };
    }

    const item = (order.items && order.items[0]) || {};
    const payer = order.payer || {};
    const fullName = [payer.first_name, payer.last_name].filter(Boolean).join(' ');

    const now = new Date();
    const sendAfter = new Date(now.getTime() + DAYS_UNTIL_CERTIFICATE * 24 * 60 * 60 * 1000);

    const store = getStore('pending-certificates');
    await store.setJSON(order.id, {
      orderId: order.id,
      title: item.title || 'petitbox',
      email: payer.email,
      fullName: fullName || '',
      purchaseDate: now.toISOString(),
      sendAfter: sendAfter.toISOString(),
      sent: false,
    });

    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    // Mercado Pago reintenta si no recibe 200 — devolvemos 200 igual para
    // no generar una tormenta de reintentos por un error transitorio nuestro,
    // pero queda registrado en los logs de la función para revisarlo.
    console.error('mp-webhook error:', err);
    return { statusCode: 200, body: 'ok' };
  }
};
