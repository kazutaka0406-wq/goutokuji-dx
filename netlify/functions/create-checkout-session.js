const PRICE_JPY = 1000;

const PRODUCT_NAME = {
  ja: '豪徳寺 デジタルプレミアムパンフレット',
  en: 'Goutokuji Digital Premium Guide',
  zh: '豪德寺 数字高级导览',
  ko: '고토쿠지 디지털 프리미엄 가이드',
  es: 'Guía Premium Digital de Goutokuji',
  fr: 'Guide Numérique Premium de Goutokuji',
};

const STRIPE_LOCALE = { ja: 'ja', en: 'en', zh: 'zh', ko: 'ko', es: 'es', fr: 'fr' };

exports.handler = async function(event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'not_configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_body' }) };
  }

  const sessionId = body.sessionId;
  if (!sessionId || typeof sessionId !== 'string') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing_session_id' }) };
  }
  const lang = STRIPE_LOCALE[body.lang] ? body.lang : 'ja';

  const origin = event.headers.origin || `https://${event.headers.host}`;
  const successUrl = `${origin}/index.html?stripe=success&sid=${encodeURIComponent(sessionId)}&lang=${lang}`;
  const cancelUrl = `${origin}/index.html?stripe=cancelled&sid=${encodeURIComponent(sessionId)}&lang=${lang}`;

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);
  params.set('client_reference_id', sessionId);
  params.set('locale', STRIPE_LOCALE[lang]);
  params.set('metadata[sessionId]', sessionId);
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'jpy');
  params.set('line_items[0][price_data][unit_amount]', String(PRICE_JPY));
  params.set('line_items[0][price_data][product_data][name]', PRODUCT_NAME[lang] || PRODUCT_NAME.en);

  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const data = await res.json();
    if (!res.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'stripe_error', detail: data.error && data.error.message }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ url: data.url }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'checkout_session_failed' }) };
  }
};
