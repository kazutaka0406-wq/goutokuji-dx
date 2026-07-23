const CONTACT_EMAIL_TO = 'umbellata0430@gmail.com';
const CONTACT_EMAIL_FROM = 'Goutokuji DX <onboarding@resend.dev>';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

exports.handler = async function(event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  if (!process.env.RESEND_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'not_configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_body' }) };
  }

  const name = (body.name || '').toString().trim().slice(0, 200);
  const contact = (body.contact || '').toString().trim().slice(0, 200);
  const content = (body.content || '').toString().trim().slice(0, 4000);
  const lang = (body.lang || '').toString().trim().slice(0, 10);

  if (!name || !contact || !content) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing_fields' }) };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: CONTACT_EMAIL_FROM,
        to: [CONTACT_EMAIL_TO],
        reply_to: contact,
        subject: `【豪徳寺DX】アプリお問い合わせ: ${name}`,
        html: `<p><strong>お名前:</strong> ${escapeHtml(name)}</p>
<p><strong>連絡先:</strong> ${escapeHtml(contact)}</p>
<p><strong>言語:</strong> ${escapeHtml(lang || '-')}</p>
<p><strong>お問い合わせ内容:</strong></p>
<p>${escapeHtml(content).replace(/\n/g, '<br>')}</p>`,
      }),
    });

    if (!res.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'email_send_failed' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'send_failed' }) };
  }
};
