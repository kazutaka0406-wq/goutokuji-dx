exports.handler = async function(event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
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

  try {
    const res = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/events?select=created_at&session_id=eq.${encodeURIComponent(sessionId)}&event_type=eq.purchase&limit=1`,
      {
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
      }
    );
    if (!res.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'supabase_read_failed' }) };
    }
    const rows = await res.json();
    return { statusCode: 200, headers, body: JSON.stringify({ paid: rows.length > 0 }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'verify_failed' }) };
  }
};
