# LandIt

AI-powered resume builder, AI mock interview practice, and real job search,
with accounts and a 7-day free trial → paid monthly or yearly subscription.

## Deploying (Vercel)

1. Go to [vercel.com](https://vercel.com), sign in, and click **Add New → Project**.
2. Import this GitHub repository.
3. Before the first deploy, open **Environment Variables** and add:
   - `ANTHROPIC_API_KEY` — get one at [console.anthropic.com](https://console.anthropic.com). Powers the AI mock interview. Without it, the interview chat still loads but shows a clear "needs an API key" message instead of a real response.
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — from a Supabase project (see below). Used server-side only, for Stripe webhook writes.
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_YEARLY` — from a Stripe account (see below).
   - `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` — from an Adzuna account (see below). Powers job search. Without it, the Job Search section shows a clear "needs an API key" message instead of results.
4. Click **Deploy**. Every future push to this branch redeploys automatically.

The site itself (`landit.html`) is served at `/`. `/api/interview`,
`/api/create-checkout-session`, `/api/stripe-webhook`, and `/api/jobs` are
small serverless functions that keep all secret keys on the server — none of
them are ever exposed to the browser.

### Setting up Supabase (accounts + saved resumes)

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. In the Supabase Dashboard, go to **SQL Editor → New query**, paste the
   entire contents of `supabase/schema.sql` from this repo, and click **Run**.
   This creates the `profiles` and `resumes` tables with the security rules
   that keep each user's data private to them.
3. Go to **Project Settings → API** and copy:
   - **Project URL** and the **anon/public key** — open `landit.html`, find
     the `SUPABASE_URL` / `SUPABASE_ANON_KEY` constants near the end of the
     file (search for `YOUR-PROJECT`), and replace both with your real
     values, then commit and push. These two are meant to be public — Supabase's
     security model relies on the Row Level Security policies from
     `schema.sql`, not on hiding them.
   - The **service_role key** (under the same page, keep this one secret) —
     add it as the `SUPABASE_SERVICE_ROLE_KEY` environment variable in Vercel.
4. In **Authentication → Providers**, email/password sign-up is on by default
   — no extra setup needed. (Optional: under **Authentication → Settings**,
   you can turn off "Confirm email" for easier testing, or leave it on for
   production.)

### Setting up Stripe (the $24/mo or $99/yr subscription)

1. Create an account at [stripe.com](https://stripe.com).
2. Go to **Product catalog → Add product**. Name it (e.g. "LandIt Pro"),
   add a price: **Recurring, Monthly, $24**. Save, then on the product page
   click **Add another price**: **Recurring, Yearly, $99**.
3. Copy both **Price IDs** (start with `price_...`) — set them as
   `STRIPE_PRICE_ID_MONTHLY` and `STRIPE_PRICE_ID_YEARLY` in Vercel.
4. Go to **Developers → API keys** and copy the **Secret key** (starts with
   `sk_...`) — set it as `STRIPE_SECRET_KEY` in Vercel.
5. Go to **Developers → Webhooks → Add endpoint**. Endpoint URL:
   `https://<your-deployed-domain>/api/stripe-webhook`. Select these events:
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Save, then copy the **Signing secret**
   (starts with `whsec_...`) — set it as `STRIPE_WEBHOOK_SECRET` in Vercel.
6. Redeploy (or just push any small change) so Vercel picks up the new
   environment variables.

Note: the 7-day free trial requires no credit card by design — it's tracked
in Supabase (`profiles.trial_started_at`), not in Stripe. Stripe only gets
involved once someone clicks "Continue to LandIt Pro" and actually subscribes.

The Account panel's "Manage billing" button (`api/create-portal-session.js`)
opens Stripe's hosted Customer Portal, where a subscriber can update their
payment method, view invoices, and cancel — no extra setup beyond the
`STRIPE_SECRET_KEY` above, but double-check **Settings → Billing → Customer
portal** is turned on in the Stripe Dashboard (on by default for most
accounts).

### Setting up Adzuna (real job search)

1. Create a free account at [developer.adzuna.com](https://developer.adzuna.com).
2. Your dashboard shows an **Application ID** and **Application Key**
   immediately — no approval wait. Set them as `ADZUNA_APP_ID` and
   `ADZUNA_APP_KEY` in Vercel.
3. Redeploy so Vercel picks up the new environment variables.

Adzuna only indexes 19 countries (there's no single "world" endpoint) —
Australia, Austria, Belgium, Brazil, Canada, France, Germany, India, Italy,
Mexico, Netherlands, New Zealand, Poland, Singapore, South Africa, Spain,
Switzerland, UK, and US. The Job Search section has a country dropdown
(`api/jobs.js` validates it against that exact list server-side); searching
a country outside it — **Norway included** — isn't possible through Adzuna
at any settings. The closest real fix for a Norway-specific job feed is
[NAV's official job vacancy feed](https://navikt.github.io/pam-stilling-feed/),
which covers the large majority of public Norwegian job ads — but unlike
Adzuna it isn't self-serve: it requires emailing
`nav.team.arbeidsplassen@nav.no`, agreeing to their terms of use, and being
issued a bearer token before any code can call it.

## Local development

```
npm install
npm install -g vercel
vercel dev
```

This serves `landit.html` and all `/api/*` functions together on `localhost`,
reading secrets from a local `.env.local` file (copy `.env.example` to
`.env.local` and fill in your values). For Stripe webhooks locally, use the
[Stripe CLI](https://stripe.com/docs/stripe-cli): `stripe listen --forward-to
localhost:3000/api/stripe-webhook`.
