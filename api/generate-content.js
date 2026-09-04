// Vercel serverless function — POST /api/generate-content
//
// Keeps the Anthropic API key server-side. Powers the "Improve with AI"
// buttons on the resume builder: rewriting/generating experience bullet
// points, and writing/improving the professional summary. This is LandIt's
// answer to Rezi.ai's AI bullet-point writer — previously the ATS score
// only *scored* content the user had to write themselves; this actually
// writes it.
//
// Requires an active trial/subscription (see api/_lib/access.js) - same
// paid-tier gate as the AI mock interview and job search.

const { requireActiveAccess } = require('./_lib/access');

const MODEL = 'claude-sonnet-5';
const MAX_FIELD_CHARS = 4000;

// Keys must match the site's SUPPORTED_LANGS in landit.html.
const LANGUAGE_NAMES = {
  en: 'English', tr: 'Turkish', de: 'German', no: 'Norwegian',
  es: 'Spanish', fr: 'French', pt: 'Portuguese', it: 'Italian',
};

function languageInstruction(lang) {
  if (!lang || lang === 'en') return '';
  const languageName = LANGUAGE_NAMES[lang] || LANGUAGE_NAMES.en;
  return `\n- Write the result in ${languageName} — the candidate is using LandIt in ${languageName}.`;
}

// Both prompts share one hard rule: never invent specific facts (metrics,
// years of experience, employers, achievements) that aren't implied by
// what the candidate actually provided. A fabricated "$2M in savings" that
// a candidate can't explain in a real interview is a real harm this
// product should never cause - the AI's job is to sharpen phrasing and
// flag where a real number belongs, not to make one up.
const BULLET_SYSTEM_PROMPT = `You are an expert resume writer helping a candidate write strong, ATS-friendly resume bullet points for LandIt, a resume-builder product.

You'll be given a job title, optionally a company name, and either existing bullet points to improve or nothing (write starter bullets from scratch).

Rules:
- If existing bullet points are given: rewrite each to open with a strong past-tense action verb (Led, Built, Reduced, Launched, etc.) and state a concrete outcome. Preserve every real fact, number, and claim already present - never change what actually happened.
- If a bullet would clearly benefit from a metric but none was given, insert a bracketed placeholder like [X]% or [add a number] instead of inventing a specific figure. Never state a fabricated number as if it were fact.
- If no existing bullet points are given: write 3-4 plausible, generic starter bullets for that job title, using bracketed placeholders (e.g. "[team size]", "[X]%") anywhere a specific fact would normally go, since none were provided - make clear via the placeholders that these need the candidate's real details filled in.
- One bullet per line, plain text only - no bullet characters (•), no numbering, no markdown, no quotes around lines.
- Keep each bullet to one line, concise (under ~200 characters).

Respond with ONLY the bullet lines, one per line, nothing else - no preamble, no explanation, no code fences.`;

const SUMMARY_SYSTEM_PROMPT = `You are an expert resume writer helping a candidate write a professional summary (the 2-4 sentence paragraph at the top of a resume) for LandIt, a resume-builder product.

You'll be given a job title/role, optionally their skills and bullet points from their experience section, and optionally an existing summary to improve.

Rules:
- Base the summary ONLY on the role, skills, and experience actually given. Never invent years of experience, employers, achievements, or credentials not present in the input.
- If the input doesn't state a specific number of years of experience, don't invent one - use general framing ("experienced", "skilled") instead of a fabricated figure like "5 years".
- If an existing summary is given, improve its clarity and impact while preserving its actual factual content - don't add new unverified claims.
- Confident, concise, no "I" statements, 2-4 sentences, plain prose - no bullet points, no markdown, no quotes around the text.

Respond with ONLY the summary text, nothing else - no preamble, no explanation, no code fences.`;

function sanitizeBullets(raw) {
  return (raw || '')
    .split('\n')
    .map((line) => line.trim().replace(/^[-•*]\s*/, '').replace(/^\d+[.)]\s*/, '').replace(/^["']|["']$/g, ''))
    .filter(Boolean)
    .join('\n');
}

function sanitizeSummary(raw) {
  return (raw || '')
    .trim()
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/```$/, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!(await requireActiveAccess(req, res))) return;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY. Add it in your Vercel project settings under Environment Variables.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const type = body?.type;
  if (type !== 'bullet' && type !== 'summary') {
    res.status(400).json({ error: 'type must be "bullet" or "summary"' });
    return;
  }

  const role = typeof body.role === 'string' ? body.role.trim() : '';
  if (!role) {
    res.status(400).json({ error: 'A job title/role is required' });
    return;
  }
  if (role.length > 200) {
    res.status(400).json({ error: 'Role is too long' });
    return;
  }

  const company = typeof body.company === 'string' ? body.company.trim().slice(0, 200) : '';
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const context = typeof body.context === 'string' ? body.context.trim() : '';
  if (text.length > MAX_FIELD_CHARS || context.length > MAX_FIELD_CHARS) {
    res.status(400).json({ error: 'Input is too long' });
    return;
  }
  const lang = typeof body.lang === 'string' && LANGUAGE_NAMES[body.lang] ? body.lang : 'en';

  let system, userMessage, maxTokens;
  if (type === 'bullet') {
    system = BULLET_SYSTEM_PROMPT + languageInstruction(lang);
    userMessage = [
      `Job title: ${role}`,
      company ? `Company: ${company}` : '',
      text ? `Existing bullet points to improve:\n${text}` : 'No existing bullet points - write starter bullets from scratch.',
    ].filter(Boolean).join('\n');
    maxTokens = 500;
  } else {
    system = SUMMARY_SYSTEM_PROMPT + languageInstruction(lang);
    userMessage = [
      `Job title: ${role}`,
      context,
      text ? `Existing summary to improve:\n${text}` : 'No existing summary - write one from scratch based on the above.',
    ].filter(Boolean).join('\n\n');
    maxTokens = 300;
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      res.status(502).json({ error: 'AI writing is unavailable right now.', detail });
      return;
    }

    const data = await upstream.json();
    const rawText = (data.content || []).map((block) => block.text || '').join('');
    const cleaned = type === 'bullet' ? sanitizeBullets(rawText) : sanitizeSummary(rawText);

    if (!cleaned) {
      res.status(502).json({ error: 'AI writing returned an empty result. Try again.' });
      return;
    }

    res.status(200).json({ text: cleaned });
  } catch (err) {
    res.status(500).json({ error: 'Content generation failed', detail: String(err) });
  }
};
