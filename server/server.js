// Minimal Express backend that proxies triage conversations to Groq's
// OpenAI-compatible Chat Completions API. The API key lives only here,
// in an environment variable — never ship it inside the Cordova app.
//
// Run:  npm install && npm start
// Env:  GROQ_API_KEY=gsk_xxxx   PORT=3000

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const MAX_FOLLOW_UPS = 4; // cap questions so users get to a result promptly

const SYSTEM_PROMPT = `You are a cautious triage assistant inside a symptom-checker app.
You are NOT a doctor and must never present a definite diagnosis.

Rules:
- Ask at most ${MAX_FOLLOW_UPS} short, specific follow-up questions, one at a time, to narrow
  down severity and likely categories of cause (onset, severity, red-flag symptoms,
  relevant history). Do not ask about things the patient already told you.
- If at any point the patient describes a possible emergency (e.g. chest pain,
  difficulty breathing, stroke signs, severe bleeding, suicidal ideation, signs of
  sepsis, severe allergic reaction), skip remaining questions and immediately return
  a result with urgency "urgent" advising emergency care.
- Once you have enough information, or you reach the question limit, return a final
  result instead of another question.
- Never invent the patient's answers. Base everything only on what they told you.

You must respond with ONLY a single JSON object, no markdown fences, no commentary,
matching exactly one of these two shapes:

Follow-up question:
{"type":"question","message":"<one short, plain-language question>"}

Final result:
{"type":"result","urgency":"low|moderate|urgent","possible_causes":["<up to 4 short, plain-language possibilities, least to most concerning>"],"recommendation":"<2-3 sentences of plain-language next steps, in the patient's language, always ending with when to seek in-person or emergency care>"}`;

app.post('/api/triage', async (req, res) => {
    try {
        const { patient, conversation } = req.body || {};

        if (!Array.isArray(conversation) || conversation.length === 0) {
            return res.status(400).json({ error: 'conversation is required' });
        }

        const contextLine = `Patient context — age: ${patient?.age ?? 'unknown'}, ` +
            `sex assigned at birth: ${patient?.sex ?? 'unknown'}, ` +
            `relevant history: ${patient?.history || 'none reported'}.`;

        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'system', content: contextLine },
            ...conversation.map(function (turn) {
                return { role: turn.role === 'user' ? 'user' : 'assistant', content: turn.content };
            })
        ];

        const apiResponse = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: messages,
                temperature: 0.3,
                response_format: { type: 'json_object' }
            })
        });

        if (!apiResponse.ok) {
            const errText = await apiResponse.text();
            console.error('Groq API error:', apiResponse.status, errText);
            return res.status(502).json({ error: 'Assessment service unavailable' });
        }

        const data = await apiResponse.json();
        const raw = data.choices?.[0]?.message?.content || '{}';

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            console.error('Could not parse model output as JSON:', raw);
            return res.status(502).json({ error: 'Unexpected response from assessment service' });
        }

        return res.json(parsed);
    } catch (err) {
        console.error('Triage endpoint error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Triage backend listening on port ${PORT}`));
