// Vercel serverless function — GET /api/jobs?what=<role>&where=<location>
//
// Proxies job search to the Adzuna API, keeping the app_id/app_key secret
// server-side. Returns a normalized, minimal job list; the frontend
// computes a real match % against the viewer's resume using the same
// keyword-matching engine as the ATS score / keyword targeting sections.
//
// Requires an active trial/subscription (see api/_lib/access.js) - this is
// a paid-tier feature, and the client-side gate alone doesn't stop someone
// from calling this endpoint directly.

const { requireActiveAccess } = require('./_lib/access');

const ADZUNA_COUNTRY = 'us';
const RESULTS_PER_PAGE = 12;

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!(await requireActiveAccess(req, res))) return;

  const { ADZUNA_APP_ID, ADZUNA_APP_KEY } = process.env;
  if (!ADZUNA_APP_ID || !ADZUNA_APP_KEY) {
    res.status(500).json({ error: 'Server is missing ADZUNA_APP_ID/ADZUNA_APP_KEY. See README.md.' });
    return;
  }

  const what = (req.query.what || '').toString().trim();
  const where = (req.query.where || '').toString().trim();
  if (!what) {
    res.status(400).json({ error: 'Missing "what" (role or keywords) query param' });
    return;
  }
  if (what.length > 200 || where.length > 200) {
    res.status(400).json({ error: 'Query is too long' });
    return;
  }

  const params = new URLSearchParams({
    app_id: ADZUNA_APP_ID,
    app_key: ADZUNA_APP_KEY,
    results_per_page: String(RESULTS_PER_PAGE),
    what,
    'content-type': 'application/json',
  });
  if (where) params.set('where', where);

  try {
    const upstream = await fetch(
      `https://api.adzuna.com/v1/api/jobs/${ADZUNA_COUNTRY}/search/1?${params.toString()}`
    );
    if (!upstream.ok) {
      const detail = await upstream.text();
      res.status(502).json({ error: 'Job search is unavailable right now.', detail });
      return;
    }

    const data = await upstream.json();
    const jobs = (data.results || []).map((j) => ({
      id: j.id,
      title: j.title || '',
      company: j.company?.display_name || '',
      location: j.location?.display_name || '',
      description: j.description || '',
      url: j.redirect_url || '',
      contractType: j.contract_time || j.contract_type || null,
      salaryMin: typeof j.salary_min === 'number' ? Math.round(j.salary_min) : null,
      salaryMax: typeof j.salary_max === 'number' ? Math.round(j.salary_max) : null,
    }));

    res.status(200).json({ jobs });
  } catch (err) {
    res.status(500).json({ error: 'Job search request failed', detail: String(err) });
  }
};
