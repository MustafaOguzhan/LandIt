// Vercel serverless function — GET /api/jobs?what=<role>&where=<location>&country=<code>
//
// Proxies job search to one of two upstream providers, keeping both APIs'
// credentials secret server-side. Returns a normalized, minimal job list;
// the frontend computes a real match % against the viewer's resume using
// the same keyword-matching engine as the ATS score / keyword targeting
// sections.
//
// Two providers because neither covers every country on its own:
// - Adzuna: ADZUNA_COUNTRIES, its fixed set of 19 indexed countries.
//   "country" was previously hardcoded to 'us' regardless of what the
//   caller searched for, so a location in any other country silently
//   searched US listings - it's now a required, whitelisted param
//   (validated here, not just trusted from the client) since it's
//   interpolated directly into the upstream URL path.
// - Careerjet: CAREERJET_LOCALES, every other country Careerjet supports
//   that Adzuna doesn't already index - closes real gaps Adzuna left (e.g.
//   Norway had no coverage at all before this). Requires a Careerjet
//   publisher account (see README) for the affid.
// Each country routes to exactly one provider - never both - to keep this
// simple and avoid double API usage for countries Adzuna already handles
// well.
//
// Requires an active trial/subscription (see api/_lib/access.js) - this is
// a paid-tier feature, and the client-side gate alone doesn't stop someone
// from calling this endpoint directly.

const { requireActiveAccess } = require('./_lib/access');

const ADZUNA_COUNTRIES = new Set([
  'au', 'at', 'be', 'br', 'ca', 'ch', 'de', 'es', 'fr', 'gb',
  'in', 'it', 'mx', 'nl', 'nz', 'pl', 'sg', 'us', 'za',
]);
// Careerjet locale codes, from https://github.com/careerjet/careerjet-api-client-python's
// full LOCALES list - every one whose country isn't already covered by
// Adzuna above. Where Careerjet lists more than one locale for the same
// country (e.g. Belgium has both fr_BE and nl_BE), that country is already
// on Adzuna so it's skipped entirely rather than picking a language.
// Russia (ru_RU) deliberately left out - worth a deliberate call given
// sanctions/compliance context, not something to include by default.
const CAREERJET_LOCALES = {
  // Europe
  ae: 'en_AE',
  cz: 'cs_CZ',
  dk: 'da_DK',
  fi: 'fi_FI',
  hu: 'hu_HU',
  ie: 'en_IE',
  lu: 'fr_LU',
  no: 'no_NO',
  pt: 'pt_PT',
  se: 'sv_SE',
  sk: 'sk_SK',
  tr: 'tr_TR',
  ua: 'uk_UA',
  // Middle East / Africa
  kw: 'en_KW',
  ma: 'fr_MA',
  om: 'en_OM',
  qa: 'en_QA',
  sa: 'en_SA',
  // Asia-Pacific
  bd: 'en_BD',
  cn: 'zh_CN',
  hk: 'en_HK',
  jp: 'ja_JP',
  kr: 'ko_KR',
  my: 'en_MY',
  ph: 'en_PH',
  pk: 'en_PK',
  tw: 'en_TW',
  vn: 'vi_VN',
  // Latin America / Caribbean
  ar: 'es_AR',
  bo: 'es_BO',
  cl: 'es_CL',
  co: 'es_CO',
  cr: 'es_CR',
  do: 'es_DO',
  ec: 'es_EC',
  gt: 'es_GT',
  pa: 'es_PA',
  pe: 'es_PE',
  pr: 'es_PR',
  py: 'es_PY',
  uy: 'es_UY',
  ve: 'es_VE',
};
const RESULTS_PER_PAGE = 12;

function stripHtmlTags(text) {
  return (text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchAdzunaJobs({ what, where, country }) {
  const { ADZUNA_APP_ID, ADZUNA_APP_KEY } = process.env;
  if (!ADZUNA_APP_ID || !ADZUNA_APP_KEY) {
    return { error: { status: 500, body: { error: 'Server is missing ADZUNA_APP_ID/ADZUNA_APP_KEY. See README.md.' } } };
  }

  const params = new URLSearchParams({
    app_id: ADZUNA_APP_ID,
    app_key: ADZUNA_APP_KEY,
    results_per_page: String(RESULTS_PER_PAGE),
    what,
    'content-type': 'application/json',
  });
  if (where) params.set('where', where);

  const upstream = await fetch(`https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params.toString()}`);
  if (!upstream.ok) {
    const detail = await upstream.text();
    return { error: { status: 502, body: { error: 'Job search is unavailable right now.', detail } } };
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
  return { jobs };
}

async function fetchCareerjetJobs({ what, where, country, req }) {
  const { CAREERJET_AFFID } = process.env;
  if (!CAREERJET_AFFID) {
    return { error: { status: 500, body: { error: 'Server is missing CAREERJET_AFFID. See README.md.' } } };
  }

  const origin = req.headers.origin || `https://${req.headers.host}`;
  const resultsPageUrl = `${origin}/#jobs`;
  const userIp = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'LandIt/1.0';

  const params = new URLSearchParams({
    affid: CAREERJET_AFFID,
    user_ip: userIp,
    user_agent: userAgent,
    url: resultsPageUrl,
    keywords: what,
    locale_code: CAREERJET_LOCALES[country],
    pagesize: String(RESULTS_PER_PAGE),
  });
  if (where) params.set('location', where);

  // Careerjet's own official API client (github.com/careerjet/careerjet-api-
  // client-python, Constants.API_URL) hardcodes this as plain http, not
  // https - this legacy endpoint apparently doesn't serve TLS, which is
  // what an https request here was failing on (Node's fetch throws a
  // generic "fetch failed" TypeError on a TLS handshake failure, before
  // any HTTP response exists to inspect). It also requires a Referer
  // header matching the `url` param - without it Careerjet rejects the
  // request with an "Undeclared referrer" error - which the official
  // client sets from the same `url` value, matched here.
  let upstream;
  try {
    upstream = await fetch(`http://public.api.careerjet.net/search?${params.toString()}`, {
      headers: { Referer: resultsPageUrl, 'User-Agent': userAgent },
    });
  } catch (networkErr) {
    return { error: { status: 502, body: { error: 'Could not reach Careerjet.', detail: String(networkErr) } } };
  }
  const rawText = await upstream.text();

  if (!upstream.ok) {
    return { error: { status: 502, body: { error: 'Job search is unavailable right now.', detail: rawText.slice(0, 800) } } };
  }

  // Careerjet can return a non-JSON body (an HTML error/approval-pending
  // page, most likely) even with a 200 status - parse defensively so that
  // case surfaces a diagnosable error instead of an uncaught exception
  // that falls through to the generic 500 in the outer handler.
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    return { error: { status: 502, body: { error: 'Job search returned an unexpected (non-JSON) response.', detail: rawText.slice(0, 800) } } };
  }

  if (data.type === 'ERROR' || (data.error && !Array.isArray(data.jobs))) {
    return { error: { status: 502, body: { error: 'Job search is unavailable right now.', detail: (data.error || data.message || JSON.stringify(data)).toString().slice(0, 800) } } };
  }

  const jobs = (data.jobs || []).map((j, idx) => ({
    id: j.url || `careerjet-${idx}`,
    title: j.title || '',
    company: j.company || '',
    location: j.locations || '',
    description: stripHtmlTags(j.description),
    url: j.url || '',
    contractType: null,
    salaryMin: null,
    salaryMax: null,
  }));
  return { jobs };
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!(await requireActiveAccess(req, res))) return;

  const what = (req.query.what || '').toString().trim();
  const where = (req.query.where || '').toString().trim();
  const country = (req.query.country || '').toString().trim().toLowerCase();
  if (!what) {
    res.status(400).json({ error: 'Missing "what" (role or keywords) query param' });
    return;
  }
  if (what.length > 200 || where.length > 200) {
    res.status(400).json({ error: 'Query is too long' });
    return;
  }

  const provider = ADZUNA_COUNTRIES.has(country) ? 'adzuna' : (country in CAREERJET_LOCALES ? 'careerjet' : null);
  if (!provider) {
    const supported = [...ADZUNA_COUNTRIES, ...Object.keys(CAREERJET_LOCALES)].sort();
    res.status(400).json({ error: 'Missing or unsupported "country" - covers: ' + supported.join(', ') });
    return;
  }

  try {
    const result = provider === 'adzuna'
      ? await fetchAdzunaJobs({ what, where, country })
      : await fetchCareerjetJobs({ what, where, country, req });

    if (result.error) {
      res.status(result.error.status).json(result.error.body);
      return;
    }
    res.status(200).json({ jobs: result.jobs });
  } catch (err) {
    res.status(500).json({ error: 'Job search request failed', detail: String(err) });
  }
};
