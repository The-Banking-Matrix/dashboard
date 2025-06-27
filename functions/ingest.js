/*************************************************************************
 * ingest.js — Apify ➜ GCS (.jsonl for Vertex-AI RAG)
 *************************************************************************/
require('dotenv').config();

const { ApifyClient } = require('apify-client');
const { Storage } = require('@google-cloud/storage');
const crypto = require('crypto');

const {
    APIFY_TOKEN,
    APIFY_ACTOR_ID,
    GOOGLE_APPLICATION_CREDENTIALS,
    GCS_BUCKET,
    GCS_PREFIX = 'bank-chunks',
    OPENAI_API_KEY,
} = process.env;

if (!APIFY_TOKEN || !APIFY_ACTOR_ID || !GCS_BUCKET || !GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('⛔  Set APIFY_TOKEN, APIFY_ACTOR_ID, GCS_BUCKET, GOOGLE_APPLICATION_CREDENTIALS');
}

const apify = new ApifyClient({ token: APIFY_TOKEN });
const storage = new Storage();

const collapse = t => t.replace(/\s+/g, ' ').trim();
const hash = s => crypto.createHash('md5').update(s).digest('hex');
function split(txt, max = 1500) {
    const out = []; let buf = '';
    for (const ln of txt.split(/\n+/)) {
        if ((buf + ln).length > max) { out.push(buf.trim()); buf = ''; }
        buf += ln + ' ';
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
}

async function ingest(maxPages = 10000) {
    console.log('🚀  Starting Apify actor…');
    const run = await apify.actor(APIFY_ACTOR_ID).call({
        startUrls: [{ url: 'https://hiddenroad.com/' }],
        maxPages,
        saveFiles: true,
        crawlerType: 'BROWSER',
        openAIApiKey: OPENAI_API_KEY,
    });

    console.log(`ℹ️  Run ID: ${run.id}`);
    console.log(`   defaultDatasetId: ${run.defaultDatasetId}`);
    console.log(`   status: ${run.status}`);
    if (run.status !== 'SUCCEEDED') {
        throw new Error(`Actor ended with status ${run.status}`);
    }

    console.log('⬇️  Downloading dataset as JSON…');
    const dataset = apify.dataset(run.defaultDatasetId);
    let rows = await dataset.downloadItems('json'); // can be array, string, or Buffer

    // 🚑 Fix: decode Buffer/string if needed
    if (Buffer.isBuffer(rows)) {
        rows = rows.toString('utf-8');
    }
    if (typeof rows === 'string') {
        try {
            rows = JSON.parse(rows);
        } catch (e) {
            console.error('Could not parse string rows:', rows.slice(0, 500));
            throw e;
        }
    }
    if (!Array.isArray(rows) || rows.length === 0) {
        console.error('🚨 final rows:', typeof rows, rows && rows.length);
        throw new Error('Dataset empty or unparsable.');
    }

    console.log(`📦  Retrieved ${rows.length} rows`);
    console.log('[DEBUG] Sample row #0 keys:', Object.keys(rows[0]));
    console.log('[DEBUG] Sample row #0:', JSON.stringify(rows[0], null, 2));

    let jsonl = '';
    let stored = 0, skipURL = 0, skipTXT = 0;

    for (const r of rows) {
        if (typeof r !== 'object' || r === null) {
            skipTXT++; continue;
        }
        const url = r.url || r.pageUrl || r.loadedUrl || r.request?.url || '';
        const text = collapse(r.content || r.text || '');

        if (!url) { skipURL++; continue; }
        if (!text) { skipTXT++; continue; }

        for (const [i, chunk] of split(text).entries()) {
            jsonl += JSON.stringify({ id: hash(url + '|' + i), uri: url, text: chunk }) + '\n';
            stored++;
        }
    }

    console.log(`✂️  Chunks: ${stored} | skipURL: ${skipURL} | skipTXT: ${skipTXT}`);
    if (stored === 0) {
        throw new Error('No chunks extracted – aborting.');
    }

    const date = new Date().toISOString().slice(0, 10);
    const name = `${GCS_PREFIX}/${date}-${hash(String(Date.now())).slice(0, 8)}.jsonl`;
    console.log(`☁️  Uploading → gs://${GCS_BUCKET}/${name}`);
    await storage.bucket(GCS_BUCKET)
        .file(name)
        .save(jsonl, { contentType: 'application/json' });

    console.log('🎉  DONE – JSONL ready for Vertex-AI RAG Engine');
}

if (require.main === module) {
    const arg = process.argv.find(a => a.startsWith('--pages='));
    const pages = arg ? parseInt(arg.split('=')[1], 10) : 10000;
    ingest(Number.isFinite(pages) ? pages : 10000)
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = { ingest };
