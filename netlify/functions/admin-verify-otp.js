const { getClientIp, checkLockout, recordFailure, clearFailures, signSessionToken } = require('./lib/adminAuth');

exports.handler = async function(event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY || !process.env.ADMIN_SESSION_SECRET) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'not_configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_body' }) };
  }

  const ip = getClientIp(event);
  const lockout = await checkLockout(ip);
  if (lockout.locked) {
    return { statusCode: 423, headers, body: JSON.stringify({ error: 'locked', lockedUntil: lockout.lockedUntil }) };
  }

  const otpSession = (body.otpSession || '').toString();
  const code = (body.code || '').toString().trim();

  if (!otpSession || !code) {
    await recordFailure(ip);
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_request' }) };
  }

  const sbHeaders = {
    'apikey': process.env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
  };

  try {
    const getRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/admin_otp_codes?otp_session=eq.${encodeURIComponent(otpSession)}&select=*`,
      { headers: sbHeaders }
    );
    if (!getRes.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'lookup_failed' }) };
    }
    const rows = await getRes.json();
    const row = rows[0];

    if (!row || row.used || new Date(row.expires_at).getTime() < Date.now() || row.code !== code) {
      await recordFailure(ip);
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'invalid_code' }) };
    }

    /* used=eq.falseを条件にすることで同時アクセスによる二重使用を防ぐ */
    const patchRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/admin_otp_codes?otp_session=eq.${encodeURIComponent(otpSession)}&used=eq.false`,
      {
        method: 'PATCH',
        headers: { ...sbHeaders, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({ used: true }),
      }
    );
    if (!patchRes.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'redeem_failed' }) };
    }
    const updated = await patchRes.json();
    if (!updated.length) {
      await recordFailure(ip);
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'invalid_code' }) };
    }

    await clearFailures(ip);
    const sessionToken = signSessionToken();
    return { statusCode: 200, headers, body: JSON.stringify({ sessionToken }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'verify_failed' }) };
  }
};
