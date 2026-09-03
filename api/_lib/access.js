// Shared server-side gate for endpoints that should only run for a
// logged-in user with an active trial or paid subscription (AI interview,
// job search).
//
// The frontend already hides/blocks these actions client-side via
// hasActiveAccess() in landit.html, but that's a UX convenience, not a
// security boundary - anyone who knows the endpoint URL could call it
// directly and rack up real Anthropic/Adzuna usage otherwise. This mirrors
// the exact trial/subscription logic from landit.html's
// hasActiveAccess()/trialDaysLeft() so both sides agree.
//
// NOTE: this file lives under api/_lib/ (not api/) so Vercel doesn't treat
// it as a route of its own - only files directly under api/ become
// endpoints.

const { createClient } = require('@supabase/supabase-js');

const TRIAL_DAYS = 7;

function trialDaysLeft(trialStartedAt) {
  const elapsedDays = (Date.now() - new Date(trialStartedAt).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(TRIAL_DAYS - elapsedDays));
}

// Verifies the caller's Supabase session and active-access status. On
// success, resolves to { user }. On failure, writes the appropriate error
// response itself (401/403/500) and resolves to null - callers should
// `return` as soon as they get null back, without writing their own response.
async function requireActiveAccess(req, res) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Server is missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY. See README.md.' });
    return null;
  }

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken) {
    res.status(401).json({ error: 'Please log in to use this feature.' });
    return null;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    res.status(401).json({ error: 'Your session has expired. Please log in again.' });
    return null;
  }
  const user = userData.user;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('trial_started_at, subscription_status')
    .eq('id', user.id)
    .single();
  if (profileError || !profile) {
    res.status(403).json({ error: 'Could not load your account status.' });
    return null;
  }

  const active = profile.subscription_status === 'active' || trialDaysLeft(profile.trial_started_at) > 0;
  if (!active) {
    res.status(403).json({ error: 'Your trial has ended. Choose a plan to keep using this feature.' });
    return null;
  }

  return { user };
}

module.exports = { requireActiveAccess, trialDaysLeft };
