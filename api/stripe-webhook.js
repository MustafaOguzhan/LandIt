// Vercel serverless function — POST /api/stripe-webhook
//
// Stripe calls this whenever a subscription-related event happens
// (checkout completed, renewed, canceled, payment failed...). It verifies
// the request really came from Stripe, then updates the matching user's
// profiles.subscription_status in Supabase using the service role key
// (this runs with no logged-in user, so it must bypass Row Level Security).
//
// Configure this URL in the Stripe Dashboard -> Developers -> Webhooks:
//   https://<your-domain>/api/stripe-webhook
// listening for: checkout.session.completed, customer.subscription.updated,
// customer.subscription.deleted, customer.subscription.trial_will_end

const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const { sendFeedbackEmail } = require('../lib/resend');

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function mapStripeStatus(stripeStatus) {
  if (stripeStatus === 'active') return 'active';
  if (stripeStatus === 'trialing') return 'trialing';
  if (stripeStatus === 'past_due' || stripeStatus === 'unpaid') return 'past_due';
  return 'canceled'; // canceled, incomplete_expired, paused, etc.
}

function formatUsd(unitAmount) {
  return '$' + (unitAmount / 100).toFixed(2);
}

function formatDate(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    res.status(500).json({ error: 'Server is missing required environment variables.' });
    return;
  }

  const stripe = Stripe(STRIPE_SECRET_KEY);
  const rawBody = await readRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    res.status(400).json({ error: 'Invalid webhook signature', detail: err.message });
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.client_reference_id;
      if (userId && session.subscription) {
        // Don't assume 'active' - Checkout completing just means the card
        // was saved successfully. If subscription_data.trial_period_days
        // was set (a first-time subscriber), the subscription's real
        // status right now is 'trialing', not 'active' - fetch it instead
        // of guessing, so the Account panel and access checks agree with
        // what Stripe actually thinks is true.
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await supabase.from('profiles').update({
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
          subscription_status: mapStripeStatus(subscription.status),
          updated_at: new Date().toISOString(),
        }).eq('id', userId);
      }
    } else if (event.type === 'customer.subscription.trial_will_end') {
      // Stripe fires this 3 days before a trial converts to a paid charge
      // (its default lead time). This is the "we're about to charge your
      // card" notice - required for doing auto-converting trials the
      // right way, not a surprise charge with no warning.
      const subscription = event.data.object;
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, trial_ending_email_sent_at')
        .eq('stripe_customer_id', subscription.customer)
        .single();

      if (profile && !profile.trial_ending_email_sent_at) {
        const { data: userData } = await supabase.auth.admin.getUserById(profile.id);
        const email = userData?.user?.email;
        const price = subscription.items?.data?.[0]?.price;
        if (email && price && subscription.trial_end) {
          const amount = formatUsd(price.unit_amount);
          const interval = price.recurring?.interval === 'year' ? 'year' : 'month';
          const chargeDate = formatDate(subscription.trial_end);
          try {
            await sendFeedbackEmail({
              to: email,
              subject: `Your LandIt trial ends ${chargeDate} — here's what happens next`,
              text: [
                'Hi,',
                '',
                `Your 7-day free trial ends on ${chargeDate}. After that, your card on file will be charged ${amount}/${interval} to continue on LandIt Pro — no action needed if you want to keep going.`,
                '',
                "If you'd rather not continue, cancel anytime before then from Account → Manage billing, and you won't be charged.",
                '',
                'Thanks,',
                'The LandIt team',
              ].join('\n'),
            });
            await supabase
              .from('profiles')
              .update({ trial_ending_email_sent_at: new Date().toISOString() })
              .eq('id', profile.id);
          } catch (err) {
            // Non-critical - don't fail the webhook (and trigger a Stripe
            // retry) over an email that couldn't be sent.
          }
        }
      }
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const status = event.type === 'customer.subscription.deleted' ? 'canceled' : mapStripeStatus(subscription.status);

      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, subscription_status, cancel_feedback_email_sent_at')
        .eq('stripe_customer_id', subscription.customer)
        .single();

      await supabase.from('profiles').update({
        stripe_subscription_id: subscription.id,
        subscription_status: status,
        updated_at: new Date().toISOString(),
      }).eq('stripe_customer_id', subscription.customer);

      // Fire the "why did you cancel" email only on the transition into
      // canceled (not on retries of the same event, and not on unrelated
      // updates like a card change) and only once per user ever.
      const justCanceled = status === 'canceled'
        && existingProfile
        && existingProfile.subscription_status !== 'canceled'
        && !existingProfile.cancel_feedback_email_sent_at;
      if (justCanceled) {
        const { data: userData } = await supabase.auth.admin.getUserById(existingProfile.id);
        const email = userData?.user?.email;
        if (email) {
          try {
            await sendFeedbackEmail({
              to: email,
              subject: 'Sorry to see you go — one quick question',
              text: [
                'Hi,',
                '',
                'I noticed your LandIt subscription was just canceled. Mind sharing why?',
                "Price, a missing feature, or something that didn't work well?",
                '',
                'Hit reply, I read every one of these myself and it genuinely helps.',
                '',
                'Thanks,',
                'The LandIt team',
              ].join('\n'),
            });
            await supabase
              .from('profiles')
              .update({ cancel_feedback_email_sent_at: new Date().toISOString() })
              .eq('id', existingProfile.id);
          } catch (err) {
            // Don't fail the whole webhook (and trigger a Stripe retry) over
            // a non-critical feedback email - the subscription status above
            // already saved successfully, which is what actually matters.
          }
        }
      }
    }
    // Other event types are ignored on purpose - Stripe expects a 200 for
    // any event type we receive, whether or not we act on it.

    res.status(200).json({ received: true });
  } catch (err) {
    // Returning 500 makes Stripe retry the delivery automatically.
    res.status(500).json({ error: 'Webhook handler failed', detail: err.message });
  }
};

// Signature verification needs the exact raw request bytes Stripe signed -
// the platform's default JSON body parsing would re-serialize the body and
// break the signature check, so it's disabled for this one function. Must
// be set on the final exported handler, after module.exports is assigned.
module.exports.config = { api: { bodyParser: false } };
