# LandIt — Project Context

## What this is
LandIt is a resume/career SaaS — an AI-powered resume builder in the same
category as Rezi.ai, Kickresume, Teal, etc. It is **not** a copy of any of
those products: no code, design, copy, or branding was taken from them.
Only the general feature category (resume builder + ATS scoring + keyword
targeting + AI interview practice + job search) is shared, which is
standard and legal in this market — dozens of competitors exist.

## Business model
- Target audience: broad / general job seekers, not a specific niche.
- Monetization: **7-day free trial, no credit card required**, then a
  **paid annual subscription** (current placeholder price: $89/year).
- Priority: the owner has explicitly said **cost is not a concern — the
  top priority is a reliable, bug-free product.** Prefer correctness and
  stability over speed of delivery, especially for anything touching
  payments, auth, or user data.

## Brand identity
- **Name:** LandIt (a nod to "landing" a job / landing a plane —
  the logo uses a dashed flight-path arriving at a checkmark-like mark).
- **Design direction:** warm, trustworthy color family, but vivid/saturated
  rather than muted. Avoid overusing any single color — green is the
  primary brand/CTA color but should NOT dominate every section (this was
  explicitly corrected once already — kickers, badges, and accents are
  now spread across green, teal, amber, clay, and plum).
- **Typography:** Fraunces (serif, display/headings) + Inter (sans, body).
- **Palette (CSS variables already defined in the prototype):**
  - `--forest #1F9E5E` (primary brand / CTA — use sparingly elsewhere)
  - `--amber #F5A623`
  - `--clay #E85A3B`
  - `--plum #9B4FC2`
  - `--teal #17A2B8`
  - `--paper #FAF7F2` (background), `--ink #1B2430` (text)
- Section "kicker" labels each have their own assigned color (not all green)
  — see the prototype for the exact mapping.
- The ATS score ring animates from 0 to the target score on scroll-into-view,
  with color interpolating from warm (low score) to cool green (high score).
  This pattern (dynamic warm→cool color tied to a score value) should be
  reused anywhere else a score/quality metric is shown.

## Product positioning (important nuance)
- The **resume builder is the primary hook** — that's what people search
  for and come in for.
- The **AI mock interview feature is the key differentiator** from
  competitors, but should be presented as a strong supporting feature,
  not the headline. It's emphasized via a dedicated "What makes LandIt
  different" section and a hero tab, not as the main value prop.

## Current prototype state
A single-file frontend (`landit.html`) plus a few serverless backend
endpoints (`api/interview.js` for the AI interview, `api/create-checkout-
session.js` and `api/stripe-webhook.js` for payments) exist in this project,
backed by a Supabase project for auth/data (`supabase/schema.sql`). Honest
status of each feature:

| Feature | Status |
|---|---|
| Resume builder (name, role, contact, summary, multiple experience entries, education, skills) | **Fully functional.** Live preview updates in real time. |
| PDF download | **Fully functional**, via browser print (`window.print()` + `@media print` CSS that isolates the resume). No backend needed for this — works as-is once deployed. |
| ATS score | **Real, heuristic-based.** Client-side JS in `landit.html` scores Content/Impact/Keywords/Formatting from the actual builder fields (field completeness, strong-verb + metric detection in bullets, structural sanity checks) and blends them into the overall score; the ring/breakdown bars update live as you type. No backend or AI call. |
| Keyword targeting | **Real, heuristic-based.** Extracts candidate phrases from the pasted job description (clause-boundary splitting + filler-word trimming) and checks each against the resume with word-boundary matching; chips update live. Same computation feeds the ATS score's "Keywords" sub-score. |
| AI mock interview | **Real text chat, wired to Claude.** `api/interview.js` (Vercel serverless function) holds the Anthropic API key server-side and returns the interviewer's next question plus live clarity/structure/specificity/confidence scores as JSON; the frontend chat log and score bars in `landit.html` are driven by real responses, not scripted ones. Requires `ANTHROPIC_API_KEY` to be set in the deployment's environment variables to actually respond (see README) — without it, the UI shows a clear "needs to be deployed with a key" error instead of failing silently. Voice input/output is not built yet — text only. |
| Job search listings | **Fake/demo only.** Three static hardcoded jobs. Needs a real job data source or manual entry system. |
| Templates section | Visual only — swatches, not real selectable/exportable templates yet. |
| User accounts / auth | **Real, via Supabase Auth.** Email/password sign up and log in (modal on any "Log in" / "Start free trial" click). Session persists across visits. `supabase/schema.sql` defines the `profiles` table (auto-created per user via a DB trigger) with RLS so a user can only ever read/write their own row. Needs a real Supabase project's URL/anon key filled in (see README) — the SQL migration is written but has to be run once against that project. |
| Payments / subscription (7-day trial → annual plan) | **Real, via Stripe.** The 7-day trial requires no card — it's tracked purely in Supabase (`profiles.trial_started_at`), not in Stripe. Stripe is only involved when a user clicks "Continue to LandIt Pro": `api/create-checkout-session.js` creates a real Stripe Checkout Session; `api/stripe-webhook.js` verifies Stripe's webhook signature and updates `profiles.subscription_status` (active/past_due/canceled) so the nav trial/Pro badge reflects reality. Needs a Stripe account + product/price + webhook configured (see README). Feature-gating specific builder actions by subscription status (e.g. blocking the builder once the trial expires) is not implemented yet — trial/Pro status is tracked and displayed, but nothing is hard-blocked on it. |
| Data persistence (saving a resume between visits) | **Real, via Supabase.** For a logged-in user, the resume auto-saves (debounced) to the `resumes` table on every change and loads back in on their next visit/device. Logged-out visitors still get the full builder with no persistence, same as before. |

## Suggested build priority (as discussed, subject to the owner's input)
1. ✅ Resume builder + PDF export — done, real, working.
2. ✅ AI mock interview (text) — real Claude API integration built (see
   `api/interview.js`). Remaining: deploy with an API key, and voice
   input/output is a possible later enhancement, not required for launch.
3. ✅ Auth + Stripe subscription (trial → annual) — real Supabase auth +
   real Stripe Checkout/webhook (see status table above). Remaining: run
   the SQL migration and fill in real Supabase/Stripe credentials (see
   README); optionally add hard feature-gating by subscription status later.
4. ✅ Real ATS scoring + keyword targeting logic — heuristic-based,
   client-side, no backend needed (see status table above).
5. Real job search data.

## Notes for whoever picks this up
- The owner is not a developer — explain technical tradeoffs in plain
  terms, and default to the most reliable/secure option rather than the
  fastest one, especially for auth and payments.
- Keep the existing visual identity (colors, type, layout patterns,
  the flight-path logo motif) consistent when building new real features
  — don't restyle from scratch.
