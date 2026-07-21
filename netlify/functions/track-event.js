const ALLOWED_TYPES = ['purchase', 'stamp', 'omikuji', 'survey'];

exports.handler = async function(event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    /* 未設定でもビジター体験は止めない：静かに失敗させる */
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: 'not_configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_body' }) };
  }

  const { type, sessionId, lang, payload } = body;
  if (!ALLOWED_TYPES.includes(type) || !sessionId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_event' }) };
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
        event_type: type,
        lang: lang || null,
        payload: payload || {},
      }]),
    });

    if (!res.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'supabase_write_failed' }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'track_failed' }) };
  }
};
