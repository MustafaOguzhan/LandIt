// Vercel serverless function — POST /api/create-portal-session
//
// Called from the Account panel's "Manage billing" button. Verifies the
// caller's Supabase session, then creates a Stripe Billing Portal session
// for their existing Stripe customer — Stripe's own hosted page handles
// updating the payment method, viewing invoices, and canceling the
// subscription, so none of that needs to be built here.
//
// Requires the Stripe Dashboard's Customer Portal to be enabled once
// (Settings -> Billing -> Customer portal) — on by default for most
// accounts, but worth checking if this endpoint ever 400s unexpectedly.

const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
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
  if (profileError || !profile) {
    res.status(500).json({ error: 'Could not load profile' });
    return;
  }
  if (!profile.stripe_customer_id) {
    res.status(400).json({ error: "You don't have a billing account yet — choose a plan first." });
    return;
  }

  const stripe = Stripe(STRIPE_SECRET_KEY);

  try {
    const origin = req.headers.origin || `https://${req.headers.host}`;
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/landit.html`,
    });
    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: 'Could not open billing portal', detail: err.message });
  }
};
