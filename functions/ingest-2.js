/*************************************************************************
 * ingest.js —  download existing Apify dataset → enforce chunk size → embed → Firestore
 *************************************************************************/

const { ApifyClient } = require('apify-client');
const admin = require('firebase-admin');
const { OpenAI } = require('openai');
const got = require('got');
const mime = require('mime-types');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const mammoth = require('mammoth');
const Papa = require('papaparse');
const XLSX = require('xlsx');
const crypto = require('crypto');
require('dotenv').config();

// ──────────────────────────  ENV & SDKs  ────────────────────────────
const apify = new ApifyClient({ token: process.env.APIFY_TOKEN });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

admin.initializeApp({
    credential: admin.credential.cert(require('./serviceAccount.json')),
});
const db = admin.firestore();

// ──────────────────────────  HELPERS  ───────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const hash = (str) => crypto.createHash('md5').update(str).digest('hex');
const collapse = (t) => t.replace(/\s+/g, ' ').trim();

// slice into sliding windows of up to `maxLen` characters
function splitIntoChunks(text, maxLen = 1000) {
    const chunks = [];
    for (let i = 0; i < text.length; i += maxLen) {
        chunks.push(text.slice(i, i + maxLen));
    }
    return chunks.filter(c => c.trim().length > 0);
}

async function embed(text) {
    const resp = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
    });
    return resp.data[0].embedding;
}

async function storeChunk({ text, embedding, src, fileType, i }) {
    const id = hash(src + '|' + i);
    await db
        .collection('bank-chunks')
        .doc(id)
        .set({
            text,
            embedding,
            src,
            fileType,
            created: admin.firestore.FieldValue.serverTimestamp(),
        });
}

// ───────────────────  REMOTE-FILE TEXT EXTRACTION  ──────────────────
async function download(url) {
    const { body, headers } = await got(url, {
        responseType: 'buffer',
        followRedirect: true,
        timeout: 120000,
        headers: { 'user-agent': 'ApifyBot/1.0' },
    });
    return { buf: body, ct: headers['content-type'] || '' };
}

async function extractText(url) {
    const { buf, ct } = await download(url);
    const ext =
        (mime.extension(ct) ||
            url.split(/[?#]/)[0].split('.').pop()).toLowerCase();

    try {
        if (ext === 'pdf') {
            return collapse((await pdfParse(buf)).text);
        }
        if (ext === 'docx' || ext === 'doc') {
            return collapse((await mammoth.extractRawText({ buffer: buf })).value);
        }
        if (ext === 'csv') {
            return Papa.parse(buf.toString('utf8')).data.flat().join(' ');
        }
        if (ext === 'xlsx' || ext === 'xls') {
            const wb = XLSX.read(buf, { type: 'buffer' });
            return collapse(
                JSON.stringify(
                    Object.fromEntries(
                        wb.SheetNames.map(s => [
                            s,
                            XLSX.utils.sheet_to_json(wb.Sheets[s], { defval: '' }),
                        ])
                    )
                )
            );
        }
        if (ext === 'txt') {
            return collapse(buf.toString('utf8'));
        }
    } catch (e) {
        console.warn(`⚠️ parse fail ${url} → ${e.message}`);
    }
    return `[BINARY ${ext} ${buf.length}B]`;
}

// ───────────────────  INGEST LOGIC  ────────────────────────────────
async function ingestItems(items) {
    let stored = 0;

    for (const rec of items) {
        console.log(`\n➡️  Processing URL: ${rec.url}`);
        const baseText = rec.content
            ? rec.content
            : await extractText(rec.url);

        const fileType = rec.fileType || 'html';
        const chunks = splitIntoChunks(baseText, 1000);

        console.log(`   → split into ${chunks.length} chunks (max 1000 chars each)`);
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            console.log(`     • chunk ${i + 1}/${chunks.length} — ${chunk.length} chars`);
            try {
                const vector = await embed(chunk);
                await storeChunk({
                    text: chunk,
                    embedding: vector,
                    src: rec.url,
                    fileType,
                    i,
                });
                stored++;
            } catch (err) {
                console.error(`       ❌ embed failed: ${err.message}`);
            }
            if (stored % 20 === 0) await sleep(400);
        }
    }
    return stored;
}

// ───────────────────  FETCH & RUN INGEST ────────────────────────────
async function ingestDataset() {
    const DATASET_ID = 'cHpglcoMf6gWYAw9j';
    console.log(`⬇️  downloading dataset ${DATASET_ID}…`);
    const { items } = await apify.dataset(DATASET_ID).listItems({ limit: Infinity });
    console.log(`📦 ${items.length} records retrieved`);
    const inserted = await ingestItems(items);
    console.log(`🎉 ${inserted} chunks embedded & stored`);
}

if (require.main === module) {
    ingestDataset().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
