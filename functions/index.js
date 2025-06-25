/********************************************************************
 * index.js  –  API server
 *   • Vector RAG (bank-chunks)
 *   • Direct crypto-friendly lookup
 *   • Conditional source-link sharing
 *******************************************************************/
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const admin = require('firebase-admin');
const { OpenAI } = require('openai');

/* ───────────── Firebase ───────────────────────────────────────── */
const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    || path.resolve('./serviceAccount.json');
admin.initializeApp({
    credential: admin.credential.cert(require(saPath)),
});
const db = admin.firestore();

/* ───────────── Vector helper (needs Firebase) ────────────────── */
const { retrieveRelevantChunks } = require('./rag');

/* ───────────── OpenAI ─────────────────────────────────────────── */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ───────────── Express basics ─────────────────────────────────── */
const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors());
app.use(express.json());

/* ───────────── tiny helpers ───────────────────────────────────── */
const cryptoAsk = t =>
    /\bcrypto[- ]?friendly\b|\ballow(?:s|ing)?\s+crypto\b/i.test(t);

const sanitizeAnswer = txt =>
    txt.split('\n')
        .filter(l =>
            !/^(for|please)\b.+(details|information|more|contact)/i.test(l.trim()))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

/* ------------------------------------------------------------------
   CHAT  endpoint
   ----------------------------------------------------------------*/
app.post('/chat', async (req, res) => {
    const history = req.body.conversation ?? [];
    if (!Array.isArray(history) || history.length === 0) {
        return res.status(400).json({ error: 'conversation array required' });
    }
    const userMsg = history.at(-1).content || '';

    /* 1) Optional direct crypto-friendly list -------------------- */
    let directCrypto = [];
    if (cryptoAsk(userMsg)) {
        try {
            const snap = await db.collection('banks')
                .where('crypto_friendly', '==', true)
                .get();
            directCrypto = snap.docs.map(d => {
                const { name, official_url } = d.data();
                return { name, official_url };
            });
            console.log(`⚡  direct crypto list size: ${directCrypto.length}`);
        } catch (err) {
            console.error('⚠️  direct crypto query failed:', err);
        }
    }

    /* 2) Vector retrieval over bank-chunks ----------------------- */
    let ragText = '';
    let sourceArr = [];
    try {
        let chunks = await retrieveRelevantChunks(userMsg, 40);   // get a few extra
        sourceArr = [...new Set(chunks.map(c => c.src))].slice(0, 20);
        ragText = chunks.map(c => c.text.replace(/\s+/g, ' ')).join('\n\n');

        // hard cap on chars to stay within TPM
        if (ragText.length > 28_000) ragText = ragText.slice(0, 28_000);
        console.log(`🔍  vector chunks used: ${chunks.length}`);
    } catch (err) {
        console.error('⚠️  vector search failed:', err);
    }

    /* 3) Compose system prompt ----------------------------------- */
    const systemPrompt = `
You are a senior banking-advisory assistant.

RULES
• Write concisely and definitively (e.g. “Hidden Road **is** crypto-friendly”).
• NEVER instruct the user to “visit the website”, “contact for more info”, etc.
• Only include a link **if the user explicitly asks for a source / link / pdf**.
• If you cite, use plain Markdown: [Title](https://…).
• No hallucinations. If data missing, say so briefly.

DATA
• DIRECT_CRYPTO_LIST (json) – confirmed crypto-friendly banks.
• VECTOR_CONTEXT – factual excerpts (may include fee wording, licences…).
• SOURCES – URLs you MAY cite when asked.

--- DIRECT_CRYPTO_LIST ---
${JSON.stringify(directCrypto, null, 2)}

--- VECTOR_CONTEXT ---
${ragText}

--- SOURCES ---
${JSON.stringify(sourceArr, null, 2)}
`.trim();

    /* 4) OpenAI call --------------------------------------------- */
    try {
        const ai = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                ...history,
            ],
        });

        let answer = ai.choices[0].message.content.trim();
        answer = sanitizeAnswer(answer);

        const sourcesReturned = sourceArr.filter(u => answer.includes(u));

        return res.json({
            text: answer,
            cryptoListUsed: directCrypto.length,
            vectorChunksUsed: ragText ? 20 : 0,
            sourcesReturned,
        });
    } catch (err) {
        console.error('❌  GPT call failed:', err);
        return res.status(500).json({ error: 'LLM failed' });
    }
});

/* ----------------------------------------------------------------- */
app.listen(PORT, () =>
    console.log(`✅  Vector+direct backend running at http://localhost:${PORT}`));
