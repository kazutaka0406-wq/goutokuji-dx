const crypto = require('crypto');

function verifySignature(payload, sigHeader, secret) {
  if (!sigHeader) return false;
  const parts = {};
  sigHeader.split(',').forEach((p) => {
    const [k, v] = p.split('=');
    parts[k] = v;
  });
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${parts.t}.${payload}`, 'utf8')
    .digest('hex');
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(parts.v1);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

exports.handler = async function(event) {
  const headers = { "Content-Type": "application/json" };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'not_configured' }) };
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

  const sigHeader = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  if (!verifySignature(rawBody, sigHeader, process.env.STRIPE_WEBHOOK_SECRET)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_signature' }) };
  }

  let stripeEvent;
  try {
    stripeEvent = JSON.parse(rawBody);
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_payload' }) };
  }

  if (stripeEvent.type !== 'checkout.session.completed' && stripeEvent.type !== 'checkout.session.async_payment_succeeded') {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ignored: stripeEvent.type }) };
  }

  const session = stripeEvent.data && stripeEvent.data.object;
  const sessionId = session && (session.client_reference_id || (session.metadata && session.metadata.sessionId));
  if (!sessionId) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, skipped: 'no_session_id' }) };
  }

  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify([{
        session_id: sessionId,
        event_type: 'purchase',
        lang: null,
        payload: {
          stripe_session_id: session.id,
          amount_total: session.amount_total,
          currency: session.currency,
        },
      }]),
    });

    if (!res.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'supabase_write_failed' }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'webhook_failed' }) };
  }
};
