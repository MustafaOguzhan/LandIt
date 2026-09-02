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
A working single-file HTML/CSS/JS prototype exists (`landit.html`,
attached to this project). Honest status of each feature:

| Feature | Status |
|---|---|
| Resume builder (name, role, contact, summary, multiple experience entries, education, skills) | **Fully functional.** Live preview updates in real time. |
| PDF download | **Fully functional**, via browser print (`window.print()` + `@media print` CSS that isolates the resume). No backend needed for this — works as-is once deployed. |
| ATS score | **Fake/demo only.** Hardcoded score (82) with a nice animation, but does not analyze the actual resume content. Needs a real scoring approach (heuristic or AI-based). |
| Keyword targeting | **Fake/demo only.** Chips are hardcoded regardless of what's pasted in the job description box. Needs real text comparison logic. |
| AI mock interview | **Fake/demo only.** The chat is a scripted mockup — no real AI, no input, no real scoring. Needs real integration (e.g. Claude API) plus likely speech input/output. |
| Job search listings | **Fake/demo only.** Three static hardcoded jobs. Needs a real job data source or manual entry system. |
| Templates section | Visual only — swatches, not real selectable/exportable templates yet. |
| User accounts / auth | **Not built.** |
| Payments / subscription (7-day trial → annual plan) | **Not built.** |
| Data persistence (saving a resume between visits) | **Not built.** |

## Suggested build priority (as discussed, subject to the owner's input)
1. ✅ Resume builder + PDF export — done, real, working.
2. AI mock interview — real integration (this is the key differentiator).
3. Auth + Stripe subscription (trial → annual) — the monetization engine.
4. Real ATS scoring + keyword targeting logic.
5. Real job search data.

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

## Notes for whoever picks this up
- The owner is not a developer — explain technical tradeoffs in plain
  terms, and default to the most reliable/secure option rather than the
  fastest one, especially for auth and payments.
- Keep the existing visual identity (colors, type, layout patterns,
  the flight-path logo motif) consistent when building new real features
  — don't restyle from scratch.
