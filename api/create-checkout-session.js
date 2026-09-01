// Vercel serverless function — POST /api/create-checkout-session
//
// Called by a logged-in user clicking "Continue to LandIt Pro". Verifies
// their Supabase session, finds or creates their Stripe customer, and
// returns a Stripe Checkout Session URL for the $89/year subscription.
// The 7-day trial itself is tracked entirely in Supabase (profiles.
// trial_started_at) - Stripe is only involved once someone actually
// subscribes, which is what makes "no credit card required" for the
// trial possible.

const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, STRIPE_PRICE_ID } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY || !STRIPE_PRICE_ID) {
    res.status(500).json({ error: 'Server is missing required environment variables. See README.md.' });
    return;
  }

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
    .select('stripe_customer_id')
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

    const origin = req.headers.origin || `https://${req.headers.host}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${origin}/landit.html?checkout=success`,
      cancel_url: `${origin}/landit.html?checkout=cancel`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: 'Could not start checkout', detail: err.message });
  }
};
