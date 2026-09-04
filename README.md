# LandIt

AI-powered resume builder, AI mock interview practice, and real job search,
with accounts and a 7-day free trial → paid monthly or yearly subscription.

## Deploying (Vercel)

1. Go to [vercel.com](https://vercel.com), sign in, and click **Add New → Project**.
2. Import this GitHub repository.
3. Before the first deploy, open **Environment Variables** and add:
   - `ANTHROPIC_API_KEY` — get one at [console.anthropic.com](https://console.anthropic.com). Powers the AI mock interview and the "Improve with AI" resume-writing buttons. Without it, both still load but show a clear "needs an API key" message instead of a real response.
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — from a Supabase project (see below). Used server-side only, for Stripe webhook writes.
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_YEARLY` — from a Stripe account (see below).
   - `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` — from an Adzuna account (see below). Powers job search. Without it, the Job Search section shows a clear "needs an API key" message instead of results.
   - `RESEND_API_KEY`, `FEEDBACK_FROM_EMAIL`, `FEEDBACK_REPLY_TO`, `CRON_SECRET` — from a Resend account (see below). Powers the churn-feedback emails. Without `RESEND_API_KEY`/`FEEDBACK_FROM_EMAIL`, those emails just fail silently (logged, not user-facing) — nothing else breaks.
4. Click **Deploy**. Every future push to this branch redeploys automatically.

The site itself (`landit.html`) is served at `/`. `/api/interview`,
`/api/create-checkout-session`, `/api/stripe-webhook`, `/api/jobs`,
`/api/create-portal-session`, `/api/delete-account`, and
`/api/cron-trial-feedback` are small serverless functions that keep all
secret keys on the server — none of them are ever exposed to the browser.

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

### Setting up Stripe (the $13/mo or $89/yr subscription)

1. Create an account at [stripe.com](https://stripe.com).
2. Go to **Product catalog → Add product**. Name it (e.g. "LandIt Pro"),
   add a price: **Recurring, Monthly, $13**. Save, then on the product page
   click **Add another price**: **Recurring, Yearly, $89**.
3. Copy both **Price IDs** (start with `price_...`) — set them as
   `STRIPE_PRICE_ID_MONTHLY` and `STRIPE_PRICE_ID_YEARLY` in Vercel.

   Changing the price later means repeating this step, not editing the
   numbers in the Dashboard — Stripe Prices are immutable once created, by
   design (so existing subscribers' receipts always show what they actually
   agreed to). Anyone already subscribed on the old price keeps paying it
   until they cancel; Stripe has no built-in "move everyone to the new
   price" button, that's a manual per-subscription action if you ever need
   it. Not a concern before any real subscriber exists yet.
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

### Setting up Resend (churn-feedback emails)

LandIt sends two short, plain emails to learn why someone didn't stick
around — never anything promotional, and each user gets at most one of
each, ever:

- **Trial ended, never subscribed**: `api/cron-trial-feedback.js` runs
  once a day (see the `crons` entry in `vercel.json`) and emails anyone
  whose 7-day trial ended without a subscription.
- **Subscription canceled**: sent directly from `api/stripe-webhook.js`
  the moment a `customer.subscription.deleted` (or a status update that
  results in `canceled`) event comes in.

Both are just "reply and tell me why" — replies land straight in
whatever inbox you set as `FEEDBACK_REPLY_TO`, no dashboard needed.

1. Create a free account at [resend.com](https://resend.com) (3,000
   emails/month, 100/day free — far more than needed at this stage).
2. Go to **Domains → Add Domain** and add `landitai.com` (or a subdomain
   like `mail.landitai.com`, if you'd rather keep sending mail separate
   from the main domain). Resend gives you a handful of DNS records
   (TXT/MX/CNAME for SPF, DKIM, and DMARC) — add those in Namecheap's
   Advanced DNS the same way you did for the Vercel records, then click
   **Verify** in Resend once they've propagated (can take a few minutes
   to a few hours).
3. Go to **API Keys → Create API Key** — set it as `RESEND_API_KEY` in
   Vercel.
4. Set `FEEDBACK_FROM_EMAIL` to an address at your verified domain, e.g.
   `LandIt <feedback@landitai.com>` — must match the domain you verified
   in step 2, Resend rejects anything else.
5. Set `FEEDBACK_REPLY_TO` to whatever inbox you actually want the
   replies in — your personal email is fine, this can be anything.
6. Set `CRON_SECRET` to any random string (e.g. generate one with
   `openssl rand -hex 32`) — this stops anyone else from calling
   `/api/cron-trial-feedback` directly and spamming every trialing user;
   Vercel automatically sends it back as a Bearer token on its own daily
   invocation, no extra wiring needed on your end.
7. Redeploy so Vercel picks up the new environment variables. The cron
   job itself needs no manual setup beyond that — Vercel reads the
   schedule from `vercel.json` and starts running it automatically once
   deployed.

Skipping this section entirely is safe — without `RESEND_API_KEY`/
`FEEDBACK_FROM_EMAIL` set, both email attempts fail quietly (caught and
logged, not surfaced to users) and everything else keeps working exactly
as before.

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
