// Polls finn.no searches, emails when a NEW listing is priced well below the
// current market median for that search. Personal tool — unrelated to the
// LandIt product code. No dependencies (Node 18+).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = process.env.STATE_PATH || join(here, '.state', 'seen.json');
const MIN_SAMPLE = 8; // need this many priced listings before a median means anything
const UA = 'Mozilla/5.0 (compatible; personal-finn-watcher)';

export function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Accepts a normal finn.no search URL and returns candidate JSON endpoints
// (finn's two known internal search APIs) carrying the same filters, newest first.
export function apiUrls(searchUrl) {
  const u = new URL(searchUrl);
  const params = new URLSearchParams(u.search);
  params.set('sort', 'PUBLISHED_DESC');
  const key = 'SEARCH_ID_BAP_COMMON';
  return [
    `https://www.finn.no/recommerce/forsale/search/api/search/${key}?${params}`,
    `https://www.finn.no/api/search-qf?searchkey=${key}&${params}`,
  ];
}

export function parseDocs(json) {
  const docs = json?.docs || json?.data?.docs || [];
  return docs
    .map((d) => ({
      id: String(d.ad_id ?? d.id ?? ''),
      title: d.heading || d.title || '(uten tittel)',
      price: Number(d.price?.amount ?? d.price ?? NaN),
      url: d.canonical_url || (d.ad_id || d.id ? `https://www.finn.no/recommerce/forsale/item/${d.ad_id ?? d.id}` : ''),
      location: d.location || '',
    }))
    .filter((d) => d.id);
}

async function fetchListings(search) {
  const errors = [];
  for (const url of apiUrls(search.url)) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
      if (!res.ok) { errors.push(`${res.status} ${url}`); continue; }
      const listings = parseDocs(await res.json());
      if (listings.length) return listings;
      errors.push(`0 listings parsed from ${url}`);
    } catch (e) {
      errors.push(`${e.message} ${url}`);
    }
  }
  throw new Error(`finn.no returned nothing usable for "${search.name}": ${errors.join(' | ')}`);
}

export function findDeals(listings, seenIds, search) {
  const minPrice = search.minPrice ?? 0;
  const priced = listings.filter((l) => Number.isFinite(l.price) && l.price >= minPrice);
  const med = priced.length >= MIN_SAMPLE ? median(priced.map((l) => l.price)) : null;
  const cutoff = med ? med * (1 - (search.minDiscountPct ?? 25) / 100) : null;
  return priced
    .filter((l) => !seenIds.has(l.id))
    .filter((l) => (search.maxPrice == null || l.price <= search.maxPrice) && (cutoff == null ? search.maxPrice != null : l.price <= cutoff))
    .map((l) => ({ ...l, median: med, discountPct: med ? Math.round((1 - l.price / med) * 100) : null }));
}

async function sendEmail(deals) {
  const { RESEND_API_KEY, FEEDBACK_FROM_EMAIL, ALERT_TO_EMAIL } = process.env;
  if (!RESEND_API_KEY || !FEEDBACK_FROM_EMAIL || !ALERT_TO_EMAIL) {
    throw new Error('Missing RESEND_API_KEY, FEEDBACK_FROM_EMAIL or ALERT_TO_EMAIL');
  }
  const rows = deals.map((d) =>
    `<p><b>${esc(d.title)}</b><br>${d.price} kr` +
    (d.median ? ` — ca. ${d.discountPct}% under median (${Math.round(d.median)} kr)` : '') +
    `<br>${esc(d.search)}${d.location ? ' · ' + esc(d.location) : ''}<br><a href="${esc(d.url)}">${esc(d.url)}</a></p>`).join('');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: FEEDBACK_FROM_EMAIL,
      to: ALERT_TO_EMAIL,
      subject: `finn.no: ${deals.length} ny${deals.length > 1 ? 'e' : ''} billig annonse${deals.length > 1 ? 'r' : ''} — ${deals[0].title}`.slice(0, 150),
      html: rows,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function main() {
  const { searches } = JSON.parse(await readFile(join(here, 'searches.json'), 'utf8'));
  let state = {};
  try { state = JSON.parse(await readFile(STATE_PATH, 'utf8')); } catch {}

  const deals = [];
  const failures = [];
  for (const search of searches) {
    try {
      const listings = await fetchListings(search);
      const firstRun = !state[search.name];
      const seen = new Set(state[search.name] || []);
      // First run only records what's already listed, so you aren't flooded by old ads.
      if (!firstRun) deals.push(...findDeals(listings, seen, search).map((d) => ({ ...d, search: search.name })));
      state[search.name] = [...new Set([...listings.map((l) => l.id), ...seen])].slice(0, 1000);
      console.log(`${search.name}: ${listings.length} listings, ${firstRun ? 'seeded' : 'checked'}`);
    } catch (e) {
      failures.push(e.message);
      console.error(e.message);
    }
  }

  // Send before saving state: if email fails, the deal is retried next run.
  if (deals.length) await sendEmail(deals);
  await mkdir(dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(state));
  if (failures.length) process.exitCode = 1; // surfaces as a failed Actions run
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
