// Thin wrapper over Resend's REST API for the two churn-feedback emails
// (trial ended without subscribing, subscription canceled). Plain fetch
// instead of the Resend SDK - two call sites don't justify a new dependency,
// and the rest of api/ already calls external APIs with fetch directly
// (see api/interview.js, api/jobs.js).

async function sendFeedbackEmail({ to, subject, text }) {
  const { RESEND_API_KEY, FEEDBACK_FROM_EMAIL, FEEDBACK_REPLY_TO } = process.env;
  if (!RESEND_API_KEY || !FEEDBACK_FROM_EMAIL) {
    throw new Error('Missing RESEND_API_KEY or FEEDBACK_FROM_EMAIL environment variable');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FEEDBACK_FROM_EMAIL,
      to,
      subject,
      text,
      ...(FEEDBACK_REPLY_TO ? { reply_to: FEEDBACK_REPLY_TO } : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend API error (${response.status}): ${detail}`);
  }
}

module.exports = { sendFeedbackEmail };
