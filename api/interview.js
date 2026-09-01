// Vercel serverless function — POST /api/interview
//
// Keeps the Anthropic API key server-side (never shipped to the browser).
// The client sends the running conversation; this function asks Claude to
// play interviewer, score the candidate's latest answer, and return both
// as strict JSON so the frontend can drive the chat log and the score bars.

const MODEL = 'claude-sonnet-5';
const MAX_TURNS = 12; // cap history so a single request can't balloon token usage
const MAX_MESSAGE_CHARS = 3000;

const SYSTEM_PROMPT = `You are an experienced, encouraging hiring-panel interviewer running a mock job interview for a candidate practicing on LandIt, a resume/interview prep product.

Context: your opening question, already shown to the candidate, was "Let's start with one from your resume. Tell me about a time you had to launch something under a tight deadline."

Rules for every reply:
- Ask exactly one behavioral or role-relevant follow-up question, building naturally on the candidate's most recent answer.
- Keep your question concise (1-2 sentences), warm but professional in tone.
- Score ONLY the candidate's most recent answer, each 0-100:
  - clarity: how easy the answer is to follow
  - structure: whether it has a clear situation/action/result shape
  - specificity: concrete details and numbers vs. vague claims
  - confidence: decisive language vs. hedging
- Give one short, specific coaching tip tied to what they actually said.
- Respond with ONLY a JSON object and nothing else — no markdown code fences, no commentary before or after — matching exactly this shape:
{"reply": string, "scores": {"clarity": number, "structure": number, "specificity": number, "confidence": number}, "tip": string}`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY. Add it in your Vercel project settings under Environment Variables.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const history = body && Array.isArray(body.history) ? body.history : null;

  if (!history || history.length === 0) {
    res.status(400).json({ error: 'Missing conversation history' });
    return;
  }
  if (history.length > MAX_TURNS) {
    res.status(400).json({ error: `Conversation too long (max ${MAX_TURNS} turns per session)` });
    return;
  }
  for (const turn of history) {
    if (!turn || typeof turn.content !== 'string' || !turn.content.trim()) {
      res.status(400).json({ error: 'Each turn needs non-empty text content' });
      return;
    }
    if (turn.content.length > MAX_MESSAGE_CHARS) {
      res.status(400).json({ error: `A message is too long (max ${MAX_MESSAGE_CHARS} characters)` });
      return;
    }
  }

  // Drop the leading seed question (it's static UI copy, already covered by
  // the system prompt) so the remaining turns start with "user" and strictly
  // alternate, as the Anthropic Messages API requires.
  const trimmed = (history[0].role === 'assistant' || history[0].role === 'ai')
    ? history.slice(1)
    : history;

  if (trimmed.length === 0 || trimmed[0].role !== 'user') {
    res.status(400).json({ error: 'Conversation must start with the candidate\'s answer' });
    return;
  }

  const messages = trimmed.map((turn) => ({
    role: turn.role === 'ai' ? 'assistant' : turn.role,
    content: turn.content,
  }));

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
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      res.status(502).json({ error: 'The AI interviewer is unavailable right now.', detail });
      return;
    }

    const data = await upstream.json();
    const rawText = (data.content || []).map((block) => block.text || '').join('');

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = { reply: rawText || "Sorry, I didn't catch that — could you say more?", scores: null, tip: null };
    }

    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: 'Interview request failed', detail: String(err) });
  }
};
