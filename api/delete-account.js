// Vercel serverless function — POST /api/delete-account
//
// Called from the Account panel's "Delete account" button (after the user
// confirms twice client-side). Verifies the caller's Supabase session,
// cancels any active/past-due Stripe subscription immediately (so they
// aren't billed again after leaving), then deletes their Supabase auth
// user. profiles/resumes both have `on delete cascade` to auth.users in
// supabase/schema.sql, so deleting the auth user removes their profile
// and resume data too — no separate table cleanup needed here.

const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
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
    .select('stripe_subscription_id, subscription_status')
    .eq('id', user.id)
    .single();
  if (profileError) {
    res.status(500).json({ error: 'Could not load profile', detail: profileError.message });
    return;
  }

  try {
    if (STRIPE_SECRET_KEY && profile?.stripe_subscription_id &&
        (profile.subscription_status === 'active' || profile.subscription_status === 'past_due')) {
      const stripe = Stripe(STRIPE_SECRET_KEY);
      await stripe.subscriptions.cancel(profile.stripe_subscription_id);
    }

    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete account', detail: err.message });
  }
};
