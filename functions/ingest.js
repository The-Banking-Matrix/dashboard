/*************************************************************************
 * ingest.js — Apify to GCS (Vertex AI prep, no Firestore)
 *************************************************************************/
require('dotenv').config();

const { ApifyClient } = require('apify-client');
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs');

const apify = new ApifyClient({ token: process.env.APIFY_TOKEN });

// --- CONFIG ---
const GCS_BUCKET = process.env.GCS_BUCKET || 'your-bucket-name';
const GCS_PREFIX = process.env.GCS_PREFIX || 'vertex-ingest'; // folder in bucket

// --- Auth for GCP ---
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS env var must be set to the path of your service account JSON.');
}

const storage = new Storage();

// --- Helpers ---
function safeFileName(url) {
    try {
        const { hostname, pathname } = new URL(url);
        const base = (hostname + pathname)
            .replace(/[^a-z0-9]+/gi, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        return base.length > 200 ? base.slice(0, 200) : base;
    } catch {
        return 'invalid-url-' + Math.random().toString(36).slice(2, 8);
    }
}

function splitIntoChunks(text, max = 1500) {
    const out = [];
    let buff = '';
    for (const line of text.split(/\n+/)) {
        if ((buff + line).length > max) { out.push(buff.trim()); buff = ''; }
        buff += line + ' ';
    }
    if (buff.trim()) out.push(buff.trim());
    return out;
}

// --- Main ingestion ---
async function ingest() {
    const maxPagesCli = parseInt(process.argv.find(a => a.startsWith('--pages='))?.split('=')[1] || '', 10);
    const maxPages = Number.isFinite(maxPagesCli) ? maxPagesCli : 10_000;

    console.log('🚀 launching actor …');
    const run = await apify.actor(process.env.APIFY_ACTOR_ID).call({
        startUrls: [{ url: 'https://hiddenroad.com/' }],
        maxPages: maxPages,
        saveFiles: true,
        crawlerType: 'BROWSER',
        // openAIApiKey: process.env.OPENAI_API_KEY, // only if used in Apify actor
    });

    if (run.status !== 'SUCCEEDED')
        throw new Error(`Actor ended with status ${run.status}`);

    console.log('⬇️  downloading dataset (JSON)…');
    const rows = await apify.dataset(run.defaultDatasetId).downloadItems('json');
    console.log(`📦  dataset rows parsed: ${rows.length}`);

    if (rows.length === 0) {
        console.error('Dataset is empty!');
        return;
    }

    // Debug: print 3 sample rows and key structure
    console.log('[DEBUG] Sample rows:');
    for (let i = 0; i < Math.min(rows.length, 3); i++) {
        console.log(`[${i}]:`, JSON.stringify(rows[i], null, 2));
    }

    // --- Save to GCS
    let stored = 0, skipNoURL = 0, skipNoText = 0;
    for (const [i, rec] of rows.entries()) {
        const url = rec.url || rec.loadedUrl || (rec.request && rec.request.url);
        if (!url) {
            console.warn(`[DEBUG] ⚠️  skipped row ${i} (no url):`, Object.keys(rec));
            skipNoURL++;
            continue;
        }
        const text = rec.content;
        if (!text) {
            console.warn(`[DEBUG] ⚠️  skipped row ${i} (no content): ${url}`);
            skipNoText++;
            continue;
        }

        const fileType = rec.fileType || 'html';
        const chunks = splitIntoChunks(text);
        for (let j = 0; j < chunks.length; j++) {
            // Save each chunk as a .txt file (or as JSONL if needed)
            const fname = `${GCS_PREFIX}/${safeFileName(url)}-${j + 1}.${fileType}.txt`;
            try {
                const file = storage.bucket(GCS_BUCKET).file(fname);
                await file.save(chunks[j], { contentType: 'text/plain' });
                stored++;
                if (stored % 10 === 0) console.log(`[DEBUG] Uploaded ${stored} chunks...`);
            } catch (e) {
                console.error(`[ERROR] Failed upload for ${fname}:`, e.message);
            }
        }
    }
    console.log(`✅ summary — stored:${stored}  |  skipURL:${skipNoURL} |  skipText:${skipNoText}`);
    console.log('🎉 FINISHED');
}

// --- Run if direct ---
if (require.main === module) {
    ingest().catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { ingest };
