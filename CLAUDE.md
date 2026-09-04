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
  **paid subscription — $13/month or $89/year** (owner's decision, revised
  down from an initial $24/$99; Rezi.ai at ~$29/mo has real features LandIt
  currently doesn't — AI-written bullet points/cover letters, a job
  tracker/autofill extension, LinkedIn import — so pricing this close to it
  overstated LandIt's current scope. $13/$89 reflects the narrower feature
  set honestly; revisit upward once/if an AI-content-writing feature is
  built. **Update: that feature now exists** (see "AI content writing" in
  the status table below) — worth the owner revisiting price upward now
  that the gap with Rezi.ai narrowed; not changed unilaterally, still the
  owner's call. Annual plan discounted ~43% vs. paying monthly to nudge
  people toward it). No lifetime/one-time-payment tier — explicitly ruled out by
  the owner due to the unbounded long-term support liability of a one-time
  payment.
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
session.js` and `api/stripe-webhook.js` for payments, `api/jobs.js` for job
search) exist in this project, backed by a Supabase project for auth/data
(`supabase/schema.sql`). Honest
status of each feature:

| Feature | Status |
|---|---|
| Resume builder (name, role, contact, summary, multiple experience entries, education, skills) | **Fully functional.** Live preview updates in real time. |
| PDF download | **Fully functional**, via browser print (`window.print()` + `@media print` CSS that isolates the resume). No backend needed for this — works as-is once deployed. |
| ATS score | **Real, heuristic-based.** Client-side JS in `landit.html` scores Content/Impact/Keywords/Formatting from the actual builder fields (field completeness, strong-verb + metric detection in bullets, structural sanity checks) and blends them into the overall score; the ring/breakdown bars update live as you type. No backend or AI call. |
| Keyword targeting | **Real, heuristic-based.** Extracts candidate phrases from the pasted job description (clause-boundary splitting + filler-word trimming) and checks each against the resume with word-boundary matching; chips update live. Same computation feeds the ATS score's "Keywords" sub-score. |
| AI mock interview | **Real text chat, wired to Claude.** `api/interview.js` (Vercel serverless function) holds the Anthropic API key server-side and returns the interviewer's next question plus live clarity/structure/specificity/confidence scores as JSON; the frontend chat log and score bars in `landit.html` are driven by real responses, not scripted ones. Requires `ANTHROPIC_API_KEY` to be set in the deployment's environment variables to actually respond (see README) — without it, the UI shows a clear "needs to be deployed with a key" error instead of failing silently. **Voice input/output is real**, via the browser-native Web Speech API (no backend, no new API key/cost): a mic button transcribes spoken answers into the textarea (`SpeechRecognition`); a voice toggle reads AI replies aloud (`speechSynthesis`), on by default. Both feature-detected and hidden entirely on browsers without support (e.g. Firefox has no `SpeechRecognition`) — typing still works everywhere regardless. The static seed question is never auto-spoken (browsers block audio before any user gesture); only replies after the visitor's own send count. |
| Job search listings | **Real, via two providers.** `api/jobs.js` proxies to Adzuna (19 countries) or Careerjet (8 more: Denmark, Finland, Ireland, Norway, Portugal, Sweden, Turkey, UAE — added specifically to close the Norway gap, since Adzuna has no coverage there at all) depending on which country is selected, keeping both providers' credentials secret server-side; results replace the old 3 static cards. Match % is computed client-side, word-level, against the resume — deliberately not phrase-level like the Keyword Targeting section, since real job-posting prose rarely repeats resume wording verbatim and phrase matching under-scored obvious fits during testing. Needs an Adzuna account (free) and, for the extra 8 countries, a Careerjet publisher account (see README for both) — Careerjet's is a free affiliate/publisher signup, not a paid API, and requires site info + email activation. More countries can be added later (Careerjet supports 70+ locales) by extending `CAREERJET_LOCALES` in `api/jobs.js` and the country dropdown in `landit.html`. |
| Templates section | **Real, selectable, and exportable.** 4 templates (Clearline/Fieldwork/Groundwork/Runway), each a pure-CSS variant keyed off `#resume-preview[data-template="..."]` — same DOM/data every time, only accent color/rules/spacing change, so every template is exactly as print-reliable as the original. Clicking a swatch updates the live preview and the PDF download immediately; the selection is saved with the resume for logged-in users. |
| User accounts / auth | **Real, via Supabase Auth.** Email/password sign up and log in (modal on any "Log in" / "Start free trial" click). Session persists across visits. `supabase/schema.sql` defines the `profiles` table (auto-created per user via a DB trigger) with RLS so a user can only ever read/write their own row. Needs a real Supabase project's URL/anon key filled in (see README) — the SQL migration is written but has to be run once against that project. |
| Payments / subscription (7-day trial → $13/mo or $89/yr) | **Real, via Stripe.** The 7-day trial requires no card — it's tracked purely in Supabase (`profiles.trial_started_at`), not in Stripe. Stripe is only involved when a user picks "Continue with Monthly" or "Continue with Yearly": `api/create-checkout-session.js` takes a `plan` ('monthly'/'yearly'), maps it to the matching Stripe Price ID, and creates a real Checkout Session; `api/stripe-webhook.js` verifies Stripe's webhook signature and updates `profiles.subscription_status` (active/past_due/canceled) so the nav trial/Pro badge reflects reality. Needs a Stripe account + product with both prices + webhook configured (see README). **Feature-gating is real**: the resume builder and ATS score/keyword targeting stay free for everyone (no login needed), but PDF download, the AI mock interview, and job search each check `hasActiveAccess()` (logged in + trialing-with-days-left or subscription_status === 'active') before running — logged-out users get the signup modal, logged-in users past their trial get a message and a scroll to Pricing. `past_due`/`canceled` are treated as no access. |
| Data persistence (saving a resume between visits) | **Real, via Supabase.** For a logged-in user, the resume auto-saves (debounced) to the `resumes` table on every change and loads back in on their next visit/device. Logged-out visitors still get the full builder with no persistence, same as before. |
| Account management panel | **Real.** Clicking the nav email opens a panel showing plan/subscription status, a "Manage billing" button (`api/create-portal-session.js`, opens Stripe's real Customer Portal), an upgrade link back to Pricing, a change-password form, and a delete-account danger zone (`api/delete-account.js`: cancels any active Stripe subscription, deletes the Supabase auth user, profile/resume rows cascade-delete via FK) behind a double confirm. Signup also now requires a confirm-password field + an 8-char/letter/number strength check, and shows a real "check your email" success state (with a resend link) instead of silently closing. |
| AI content writing | **Real, wired to Claude.** `api/generate-content.js` powers "✨ Improve with AI" buttons on the professional summary field and each experience entry's bullet points — LandIt's answer to Rezi.ai's AI bullet-point/summary writer, previously the biggest feature gap justifying the lower price (see Business model above). Rewrites existing text (opens with a strong action verb, preserves every real fact/number) or writes plausible starter content from scratch if the field is empty; explicitly instructed to never invent specific metrics, years of experience, or achievements not implied by the input - uses bracketed placeholders (e.g. `[X]%`) instead, so nothing false ends up on a real resume. Results always show as a preview with "Use this"/"Discard" - never silently overwrites what the candidate wrote. Gated the same as the AI interview and job search (active trial/subscription required, enforced server-side). Uses the same `ANTHROPIC_API_KEY` as the AI mock interview - no new env var needed. |
| Churn-feedback emails | **Real, via Resend.** Two short "why didn't you stay" emails, each sent at most once per user: `api/cron-trial-feedback.js` runs daily (Vercel Cron, see `vercel.json`) for anyone whose 7-day trial ended without subscribing; `api/stripe-webhook.js` sends the other the moment a subscription is canceled. Both are reply-to a real inbox (`FEEDBACK_REPLY_TO`), not a survey tool — replies land directly in the owner's email. Needs a Resend account + verified sending domain (see README); safe to leave unconfigured, both attempts just fail quietly with no user-facing effect. |

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
5. ✅ Real job search data — Adzuna API, see status table above. Remaining:
   create an Adzuna account and set ADZUNA_APP_ID/ADZUNA_APP_KEY (README).

## Frontend design quality rules
Apply these whenever writing or editing any frontend code for LandIt:

- Invoke the `frontend-design` skill before writing frontend code, every session.
- **Colors:** never fall back to default Tailwind palette colors (indigo-500,
  blue-600, etc.) if using Tailwind. Use LandIt's actual palette above.
- **Shadows:** avoid flat, generic shadows — use layered, subtle, color-tinted
  shadows (the existing prototype's `--shadow` token is a reference point).
- **Typography:** keep the Fraunces (display/headings) + Inter (body) pairing
  — never collapse to a single font for both. Tight tracking on large
  headings, generous line-height on body text.
- **Animations:** animate only `transform` and `opacity`; never use
  `transition-all`. Prefer smooth, spring-like easing (see the ATS score
  ring's animateRing function in landit.html for the established pattern).
- **Interactive states:** every clickable element (buttons, links, tabs,
  form fields) needs visible hover, focus-visible, and active states —
  no exceptions.
- **Spacing:** use consistent, intentional spacing — not arbitrary values.
- **Depth:** give surfaces a clear layering system (base page → card →
  floating/modal), not everything on one flat plane.
- If a reference image/design is ever provided for a specific page, match
  its layout/spacing/typography/color exactly rather than "improving" on it;
  screenshot the local build and compare against the reference at least
  twice before considering it done.
- Do not add sections, features, or content that weren't asked for —
  check with the owner before expanding scope on a design task.

## Reference material (a professional's 11-video build series, NOT our own decisions yet)
The owner watched a full Turkish YouTube series (11 videos) of a professional
building and monetizing a similar resume-app-as-SaaS end to end, using
Antigravity (not Claude Code) with a fast, hands-off philosophy ("just let
the agent do everything, don't review the code"). **The owner's own priority
is the opposite: reliable and bug-free over fast — do not adopt that video's
philosophy by default.** Below is what that series covered, kept as
reference/inspiration only — none of it is decided for LandIt yet.

**Tech stack the video used** (each needs the tradeoff-presentation process
below before adoption for LandIt):
- Supabase — database + user auth (manual SQL migrations run by hand in
  Supabase's SQL editor, not fully automated)
- Stripe — payments (sandbox/test mode first; product + price created in
  dashboard; webhook endpoint configured; Stripe's pre-built "Pricing Table"
  embed used as a shortcut instead of a custom checkout UI)
- Resend — transactional email (e.g. magic-link login emails)
- Apify — scraping LinkedIn/job posting data (referred to as "Epify" in the
  transcripts)
- Deploy chain: GitHub → Vercel and/or Netlify and/or Bolt.new. Notably, when
  one platform's deploy error couldn't be fixed, the video's approach was to
  hand the same GitHub repo to a *different* deploy platform (tried Vercel,
  then Netlify, then Bolt.new) rather than keep fighting one tool — a
  reasonable fallback strategy if we ever get stuck on a deploy error too.
- 21st.dev / Magic MCP / React Bits — pre-built professional UI components
  (pulled in via MCP) to avoid a generic "vibe-coded" look. LandIt already
  has a fully custom, bespoke design system, so this is likely unnecessary
  for us, but worth knowing it exists as an option if a specific new page
  ever needs a fast, polished layout.
- Google Stitch / Whisk (Mixboard) — AI tools for logo and brand-asset
  generation (color variants, transparent backgrounds, moodboards).
- Mixpanel — product analytics (tracking what users click/do in-app).

**A feature idea worth considering (not decided):** the video's app generates
a shareable link for each tailored resume/cover letter (e.g. to send to a
recruiter on LinkedIn). The link works free for 7 days; after that it
redirects to an upgrade/payment page. Critically, downloading the resume as
a file has NO restriction — only the *shareable link* is what's time-gated.
This is a different mechanic than LandIt's current plan (a blanket 7-day
trial across the whole product) and could be evaluated as an alternative or
addition once we design the real monetization flow.

**Pricing rationale from the video:** landed on a single price — no monthly
tier — reasoning that people build a resume infrequently, so a recurring
monthly charge doesn't match actual usage. This supports (doesn't
override) LandIt's existing annual-only plan.

**Process lessons observed across the series:**
- Always ask the agent to plan before big changes, review the plan, then
  approve execution — repeated in nearly every episode.
- When testing auth-gated flows (magic-link email, signup), tell the agent
  to test in "dev mode" rather than "as a real user," since the agent can't
  receive real emails.
- After buying a real domain, the auth provider's "Site URL" / redirect
  config must be updated to the new domain, or login/verification links
  break. Easy to forget — worth a checklist item whenever we go live on a
  real domain.
- Progress was NOT linear — recurring bugs (created resumes disappearing,
  broken links, features silently not saving to the database) needed
  repeated rounds of "here's the error, fix it" over ~7 days of active work,
  even with the agent doing all the coding.

**Honest real-world outcome (important context, not a promise):** after the
full 11-day build-and-launch cycle, the video's app made about €200 from 2
paying customers in its first ~7 days live, with no ad spend — the creator
himself called this underwhelming ("çok başarılı oldu mu? Bence olmadı").
Turkish-language social content barely got any views; switching to English
content did notably better. His own conclusion: **building the app was the
easy part; marketing/selling it was the harder part and moved slower than
expected.** Treat this as a realistic baseline, not a guaranteed outcome —
useful for calibrating expectations, not as evidence that this exact
playbook will work.

Separately, later parts of the series covered using AI-generated "influencer"
avatars (via Sora/Kie/Prototypical + ElevenLabs voice + Nano Banana images)
to produce fake-testimonial-style marketing videos at very low cost. This is
a marketing technique, not a build technique — **flag the advertising/
disclosure risk if the owner ever wants to pursue this**: many ad platforms
and consumer-protection rules require disclosing AI-generated
"testimonials" as such, and any claims the AI character makes about the
product should stay truthful and non-exaggerated. Don't build or recommend
this without that caveat being raised explicitly.

**Whenever a technology/service choice needs to be made** (database, auth
provider, payment integration, UI component sources, etc.), present it like
this:
1. State your own recommendation and why (favor reliability/security).
2. If the referenced video series used a different choice for that same
   decision, name it explicitly and explain the actual tradeoff between the
   two (not just "the video used X" — explain what's genuinely better/worse
   about each for LandIt specifically).
3. Let the owner pick — don't default silently to either one.

## Notes for whoever picks this up
- The owner is not a developer — explain technical tradeoffs in plain
  terms, and default to the most reliable/secure option rather than the
  fastest one, especially for auth and payments.
- Keep the existing visual identity (colors, type, layout patterns,
  the flight-path logo motif) consistent when building new real features
  — don't restyle from scratch.
