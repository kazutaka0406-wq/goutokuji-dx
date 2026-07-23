const crypto = require('crypto');
const { getClientIp, checkLockout, recordFailure } = require('./lib/adminAuth');
const { sendEmail } = require('./lib/resend');

/* 二段階認証コードの送信先固定。Resendがサンドボックス（未検証ドメイン）状態のため、
   現時点ではアカウント登録時に確認済みのumbellata0430@gmail.com宛にのみ送信できる */
const OTP_EMAIL_TO = 'umbellata0430@gmail.com';

exports.handler = async function(event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  if (!process.env.ADMIN_PASSWORD || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY || !process.env.RESEND_API_KEY) {
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

  if (body.password !== process.env.ADMIN_PASSWORD) {
    await recordFailure(ip);
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'unauthorized' }) };
  }

  const otpSession = crypto.randomBytes(16).toString('hex');
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  try {
    const insertRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/admin_otp_codes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify([{ otp_session: otpSession, code, expires_at: expiresAt }]),
    });
    if (!insertRes.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'otp_store_failed' }) };
    }

    const emailRes = await sendEmail({
      to: OTP_EMAIL_TO,
      subject: '【豪徳寺DX】管理画面ログイン確認コード',
      html: `<p>管理画面ログインの確認コードです（発行から5分間有効）。</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:.1em;">${code}</p>
<p>このログインに心当たりがない場合は、このメールを無視してください。</p>`,
    });
    if (!emailRes.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'email_send_failed' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ otpSession }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'login_failed' }) };
  }
};
