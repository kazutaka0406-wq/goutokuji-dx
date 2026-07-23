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

  const token = (body.token || '').toString().trim();
  if (!token) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'invalid' }) };
  }

  const sbHeaders = {
    'apikey': process.env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
  };

  try {
    const getRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/support_passes?token=eq.${encodeURIComponent(token)}&select=*`,
      { headers: sbHeaders }
    );
    if (!getRes.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'lookup_failed' }) };
    }
    const rows = await getRes.json();
    const row = rows[0];

    if (!row) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'invalid' }) };
    }
    if (row.used) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'used' }) };
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'expired' }) };
    }

    /* used=eq.falseを条件に含めることで、同時アクセスによる二重使用を防ぐ */
    const patchRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/support_passes?token=eq.${encodeURIComponent(token)}&used=eq.false`,
      {
        method: 'PATCH',
        headers: {
          ...sbHeaders,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({ used: true, used_at: new Date().toISOString() }),
      }
    );
    if (!patchRes.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'redeem_failed' }) };
    }
    const updated = await patchRes.json();
    if (!updated.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'used' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'verify_failed' }) };
  }
};
