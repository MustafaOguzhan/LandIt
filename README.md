# LandIt

AI-powered resume builder + AI mock interview practice.

## Deploying (Vercel)

1. Go to [vercel.com](https://vercel.com), sign in, and click **Add New → Project**.
2. Import this GitHub repository.
3. Before the first deploy, open **Environment Variables** and add:
   - `ANTHROPIC_API_KEY` — get one at [console.anthropic.com](https://console.anthropic.com). This powers the AI mock interview. Without it, the interview chat still loads but shows a clear "needs an API key" message instead of a real response.
4. Click **Deploy**. Every future push to this branch redeploys automatically.

The site itself (`landit.html`) is served at `/`. The AI interview calls
`/api/interview`, a small serverless function that keeps the API key on
the server — it is never exposed to the browser.

## Local development

```
npm install -g vercel
vercel dev
```

This serves `landit.html` and `/api/interview` together on `localhost`, reading
`ANTHROPIC_API_KEY` from a local `.env.local` file (copy `.env.example` to
`.env.local` and fill in your key).
