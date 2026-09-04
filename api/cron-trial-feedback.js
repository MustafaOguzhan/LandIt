// Vercel Cron Job - invoked automatically once a day (see vercel.json).
//
// Finds users who created an account but never actually started their
// trial (never completed Stripe Checkout, so no card is on file and no
// subscription exists - stripe_subscription_id is null) and sends each
// one a short, human "what stopped you?" email, once per user.
//
// subscription_status alone can't distinguish this anymore: since the
// trial now requires a card, someone who DID check out is *also*
// 'trialing' for their first 7 days (mapped from Stripe's own 'trialing'
// status) - excluding anyone with a stripe_subscription_id is what keeps
// this from emailing "why didn't you subscribe" to someone who actually
// did and is about to be charged (that person gets the
// trial_will_end reminder from api/stripe-webhook.js instead). The
// parallel cancellation-feedback email for people who subscribed and then
// canceled also lives in api/stripe-webhook.js, since that's an event, not
// something to poll for on a schedule.

const { createClient } = require('@supabase/supabase-js');
const { sendFeedbackEmail } = require('../lib/resend');

module.exports = async (req, res) => {
  const { CRON_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

  // Vercel sends `Authorization: Bearer <CRON_SECRET>` on its own invocations
  // of this endpoint when CRON_SECRET is set - reject anything else so this
  // can't be used by a stranger to spam every trialing user's inbox.
  if (CRON_SECRET && req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Server is missing required environment variables.' });
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, trial_started_at')
    .eq('subscription_status', 'trialing')
    .is('stripe_subscription_id', null)
    .is('trial_ended_email_sent_at', null)
    .lte('trial_started_at', sevenDaysAgo);

  if (error) {
    res.status(500).json({ error: 'Could not query profiles', detail: error.message });
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const profile of profiles || []) {
    const { data: userData } = await supabase.auth.admin.getUserById(profile.id);
    const email = userData?.user?.email;
    if (!email) continue;

    try {
      await sendFeedbackEmail({
        to: email,
        subject: "Didn't get around to trying LandIt?",
        text: [
          'Hi,',
          '',
          "You signed up for LandIt a week ago but never started your free trial -",
          "no worries, just wanted to ask: what stopped you? Price, a missing",
          "feature, or something that just didn't work right?",
          '',
          "Hit reply, I read every one of these myself.",
          '',
          'Thanks,',
          'The LandIt team',
        ].join('\n'),
      });
      await supabase
        .from('profiles')
        .update({ trial_ended_email_sent_at: new Date().toISOString() })
        .eq('id', profile.id);
      sent++;
    } catch (err) {
      failed++;
    }
  }

  res.status(200).json({ checked: profiles?.length || 0, sent, failed });
};
