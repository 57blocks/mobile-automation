#!/usr/bin/env tsx
/**
 * Uploads an .ipa to a real-device cloud (LambdaTest / TestMu AI) and prints the app id.
 *
 * Every upload becomes its own app entry — there is no "most recent upload with this name"
 * lookup — so `CLOUD_APP_ID` in `.env` has to be updated after each one.
 *
 * Usage: npm run cloud:upload-ios-app
 */
import 'dotenv/config';
import fs from 'node:fs';
import { fetch, Agent } from 'undici';

const { CLOUD_USERNAME, CLOUD_ACCESS_KEY } = process.env;
const appName = process.env.APP_NAME || 'App';
const appPath = process.env.CLOUD_IOS_APP_PATH || process.env.IOS_APP_PATH || './apps/app.ipa';
const uploadUrl = process.env.CLOUD_UPLOAD_URL || 'https://manual-api.lambdatest.com/app/upload/realDevice';

if (!CLOUD_USERNAME || !CLOUD_ACCESS_KEY) {
    throw new Error('Missing CLOUD_USERNAME / CLOUD_ACCESS_KEY. See .env.example.');
}
if (!fs.existsSync(appPath)) {
    throw new Error(`App binary not found at ${appPath}. Set CLOUD_IOS_APP_PATH (or IOS_APP_PATH) to your .ipa.`);
}

const auth = Buffer.from(`${CLOUD_USERNAME}:${CLOUD_ACCESS_KEY}`).toString('base64');
const form = new FormData();
// openAsBlob streams from disk; readFileSync + `new Blob([buffer])` would hold two full
// copies of the .ipa in memory.
form.append('appFile', await fs.openAsBlob(appPath), `${appName}.ipa`);
form.append('name', `${appName}.ipa`);

console.log(`Uploading ${appPath} as "${appName}.ipa"...`);

// undici's default headersTimeout (300s) counts from request start, so a large upload on a
// slow connection can exceed it before the provider replies.
const dispatcher = new Agent({ headersTimeout: 1200000, bodyTimeout: 1200000 });

/** The provider answers with the app id under one of several field names. */
interface UploadResponse {
    app_url?: string;
    APP_URL?: string;
    appId?: string;
    app_id?: string;
    [key: string]: unknown;
}

let body: UploadResponse;
try {
    const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}` },
        body: form,
        dispatcher,
    });

    // Read the body before closing the dispatcher: fetch resolves as soon as the headers
    // arrive, and the body is still streaming over that dispatcher's socket.
    body = await response.json() as UploadResponse;

    if (!response.ok) {
        throw new Error(`Upload failed (status ${response.status}): ${JSON.stringify(body)}`);
    }
} finally {
    // Otherwise the kept-alive socket can leave the process hanging.
    await dispatcher.close();
}

const appId = body.app_url || body.APP_URL || body.appId || body.app_id;

console.log('Raw response:', JSON.stringify(body, null, 2));

if (appId) {
    console.log(`\nUploaded. Set this in .env:\nCLOUD_APP_ID=${appId}`);
} else {
    console.log(
        '\nCould not find the app id under any of the expected fields (app_url / APP_URL / '
        + 'appId / app_id) — check the raw response above and set CLOUD_APP_ID to whatever '
        + 'id it returned.'
    );
}
