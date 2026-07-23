const crypto = require('crypto');

/* トークンの有効期限＝発行時点のJST（UTC+9）でのその日の23:59:59 */
function jstEndOfDayIso() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  const endOfDayJst = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate(), 23, 59, 59);
  return new Date(endOfDayJst - 9 * 3600 * 1000).toISOString();
}

exports.handler = async function(event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY || !process.env.ADMIN_PASSWORD) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'not_configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_body' }) };
  }

  if (body.password !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'unauthorized' }) };
  }

  const token = crypto.randomBytes(16).toString('hex');
  const expiresAt = jstEndOfDayIso();

  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/support_passes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify([{
        token,
        expires_at: expiresAt,
        used: false,
      }]),
    });

    if (!res.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'supabase_write_failed' }) };
    }

    const proto = event.headers['x-forwarded-proto'] || 'https';
    const host = event.headers.host;
    const url = `${proto}://${host}/?support_pass=${token}`;

    return { statusCode: 200, headers, body: JSON.stringify({ token, url, expiresAt }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'issue_failed' }) };
  }
};
