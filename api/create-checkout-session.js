// Vercel serverless function — POST /api/create-checkout-session
//
// Called right when someone starts their free trial (from the signup
// modal) and when an existing user picks/changes a plan from Pricing or
// the Account panel. Verifies their Supabase session, finds or creates
// their Stripe customer, and returns a Stripe Checkout Session URL for the
// chosen plan's price.
//
// A card is required to start the trial (Stripe collects it during
// Checkout) so the trial can convert automatically into a paid
// subscription after 7 days without the person having to come back and
// re-enter payment details - this is disclosed clearly in the UI and in
// terms.html. A profile only gets the 7-day Stripe trial once: if
// stripe_subscription_id is already set (they've subscribed before, even
// if they later canceled), this is a straight paid Checkout with no trial.

const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, STRIPE_PRICE_ID_MONTHLY, STRIPE_PRICE_ID_YEARLY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY || !STRIPE_PRICE_ID_MONTHLY || !STRIPE_PRICE_ID_YEARLY) {
    res.status(500).json({ error: 'Server is missing required environment variables. See README.md.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const plan = body?.plan;
  if (plan !== 'monthly' && plan !== 'yearly') {
    res.status(400).json({ error: 'plan must be "monthly" or "yearly"' });
    return;
  }
  const priceId = plan === 'monthly' ? STRIPE_PRICE_ID_MONTHLY : STRIPE_PRICE_ID_YEARLY;

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }
  const user = userData.user;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('stripe_customer_id, stripe_subscription_id')
    .eq('id', user.id)
    .single();
  if (profileError) {
    res.status(500).json({ error: 'Could not load profile', detail: profileError.message });
    return;
  }

  const stripe = Stripe(STRIPE_SECRET_KEY);

  try {
    let customerId = profile.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    const trialEligible = !profile.stripe_subscription_id;
    const origin = req.headers.origin || `https://${req.headers.host}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: trialEligible ? { trial_period_days: 7 } : undefined,
      success_url: `${origin}/landit.html?checkout=success`,
      cancel_url: `${origin}/landit.html?checkout=cancel`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: 'Could not start checkout', detail: err.message });
  }
};
