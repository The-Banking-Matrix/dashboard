// budget.js
const { encode } = require('gpt-tokenizer'); // tiny lib, 3 kB install once

const TARGET_MAX = 28_000;        // leave ~2 k buffer under 30 k TPM
const MAX_USER = 8_000;         // if user prompt itself exceeds → compress

/**
 * Returns {history, rag, user} trimmed to fit TARGET_MAX tokens.
 * - history: newest first array of messages (role,content)
 * - rag:     array of context strings (already sorted by relevance)
 */
function fitWithinBudget({ systemText, userPrompt, history, ragChunks }) {
    const tokens = txt => encode(txt).length;
    const sysT = tokens(systemText);
    const userT = tokens(userPrompt);

    // If user alone is crazy large → caller must “compress”
    if (userT > MAX_USER) return { needsCompression: true };

    let cur = sysT + userT;
    const fittedHist = [];
    for (let i = history.length - 1; i >= 0; i--) {       // newest → oldest
        const t = tokens(history[i].content);
        if (cur + t > TARGET_MAX) break;
        cur += t;
        fittedHist.unshift(history[i]);
    }

    const fittedRag = [];
    for (const chunk of ragChunks) {
        const t = tokens(chunk);
        if (cur + t > TARGET_MAX) break;
        cur += t;
        fittedRag.push(chunk);
    }

    return { history: fittedHist, rag: fittedRag, needsCompression: false };
}

module.exports = { fitWithinBudget };
