/********************************************************************
 * rag.js  –  lightweight Firestore-only vector search
 ********************************************************************/
require('dotenv').config();
const admin = require('firebase-admin');
const { OpenAI } = require('openai');

// Grab the already-initialized default app
const db = admin.firestore();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Configuration
const SLICE = 20000;                  // look at newest N chunks
const TOP_N = 20;                     // return top N
const EMBED_MODEL = 'text-embedding-3-small';

// Math helpers
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const mag = v => Math.sqrt(dot(v, v));
const cosine = (a, b) => dot(a, b) / (mag(a) * mag(b) + 1e-9);

// Embed a piece of text (truncated to 8000 chars)
async function embed(text) {
    const { data } = await openai.embeddings.create({
        model: EMBED_MODEL,
        input: text.slice(0, 8000),
        encoding_format: 'float',
    });
    return data[0].embedding;
}

// Main RAG function
async function retrieveRelevantChunks(queryText, topN = TOP_N) {
    // 1) embed user question
    const qVec = await embed(queryText);

    // 2) fetch newest SLICE docs
    const snap = await db
        .collection('bank-chunks')
        .orderBy('created', 'desc')
        .limit(SLICE)
        .get();

    // 3) compute cosine sims
    const scored = snap.docs.map(doc => {
        const d = doc.data();
        const score = cosine(qVec, d.embedding);
        return { score, ...d };
    });

    // 4) sort & return topN
    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);
}

module.exports = { retrieveRelevantChunks };
