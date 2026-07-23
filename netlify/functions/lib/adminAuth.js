const crypto = require('crypto');

const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_MINUTES = 30;
const SESSION_TTL_MS = 8 * 3600 * 1000;

function _b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function _fromB64url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

/* セッショントークン＝有効期限を含むペイロードをHMAC-SHA256で署名した自己完結型トークン
   （単一の管理者共有アカウントのみを想定しているため、DBセッションテーブルは持たない） */
function signSessionToken() {
  const payload = { exp: Date.now() + SESSION_TTL_MS };
  const data = _b64url(Buffer.from(JSON.stringify(payload)));
  const sig = _b64url(crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(data).digest());
  return `${data}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [data, sig] = parts;
  const expectedSig = _b64url(crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(data).digest());
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;
  let payload;
  try {
    payload = JSON.parse(_fromB64url(data).toString());
  } catch (e) {
    return false;
  }
  if (!payload.exp || payload.exp < Date.now()) return false;
  return true;
}

function getClientIp(event) {
  const xff = event.headers['x-forwarded-for'] || event.headers['x-nf-client-connection-ip'] || '';
  return xff.split(',')[0].trim() || 'unknown';
}

function _sbHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
  };
}

async function checkLockout(ip) {
  const res = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/admin_login_attempts?ip=eq.${encodeURIComponent(ip)}&select=*`,
    { headers: _sbHeaders() }
  );
  if (!res.ok) return { locked: false };
  const rows = await res.json();
  const row = rows[0];
  if (row && row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    return { locked: true, lockedUntil: row.locked_until };
  }
  return { locked: false };
}

/* ログイン失敗（パスワード誤り・OTPコード誤り）を記録し、LOCKOUT_THRESHOLD回に達したら
   LOCKOUT_MINUTES分ロックする */
async function recordFailure(ip) {
  const getRes = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/admin_login_attempts?ip=eq.${encodeURIComponent(ip)}&select=*`,
    { headers: _sbHeaders() }
  );
  const rows = getRes.ok ? await getRes.json() : [];
  const existing = rows[0];
  const newCount = (existing ? existing.failed_count : 0) + 1;
  const lockedUntil = newCount >= LOCKOUT_THRESHOLD
    ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString()
    : (existing ? existing.locked_until : null);

  if (existing) {
    await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/admin_login_attempts?ip=eq.${encodeURIComponent(ip)}`,
      {
        method: 'PATCH',
        headers: { ..._sbHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ failed_count: newCount, locked_until: lockedUntil, updated_at: new Date().toISOString() }),
      }
    );
  } else {
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/admin_login_attempts`, {
      method: 'POST',
      headers: { ..._sbHeaders(), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify([{ ip, failed_count: newCount, locked_until: lockedUntil }]),
    });
  }
}

async function clearFailures(ip) {
  await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/admin_login_attempts?ip=eq.${encodeURIComponent(ip)}`,
    {
      method: 'PATCH',
      headers: { ..._sbHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ failed_count: 0, locked_until: null, updated_at: new Date().toISOString() }),
    }
  );
}

module.exports = {
  signSessionToken,
  verifySessionToken,
  getClientIp,
  checkLockout,
  recordFailure,
  clearFailures,
};
