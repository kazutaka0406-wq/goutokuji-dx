const RESEND_FROM = 'Goutokuji DX <onboarding@resend.dev>';

async function sendEmail({ to, subject, html, replyTo }) {
  const body = {
    from: RESEND_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  };
  if (replyTo) body.reply_to = replyTo;

  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

module.exports = { sendEmail };
