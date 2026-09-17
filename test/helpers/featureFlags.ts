import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IOS_BUNDLE_ID, ANDROID_APP_PACKAGE } from '../../config/app.config.js';

/**
 * Serves a fixed feature-flag payload to the app, so a spec gets the variant it was written
 * for. An HTTP proxy's local-mapping rule (Charles / Proxyman "Map Local", mitmproxy)
 * intercepts the flag endpoint and returns ACTIVE_FLAGS_PATH; this helper writes that file
 * and restarts the app. `browser.mock()` is not an alternative — it needs WebDriver BiDi,
 * which is browser-only.
 *
 * One-time proxy setup: trust the proxy's certificate on the device, point the device's
 * Wi-Fi proxy at your machine, and map the flag endpoint's host + path to ACTIVE_FLAGS_PATH.
 *
 * Pin every flag the flow depends on, including the ones that are *off* — anything left out
 * falls back to whatever the SDK cached.
 */

/** The complete response body the proxy will serve. */
export type FeatureFlags = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The file the proxy's Map Local rule must point at. */
export const ACTIVE_FLAGS_PATH = path.resolve(__dirname, '../fixtures/featureFlags/active.json');

/**
 * Writes the payload the proxy will serve. Separate from the restart so a test can stage
 * flags before the app is launched.
 */
export function writeFlags(flags: FeatureFlags): void {
    fs.mkdirSync(path.dirname(ACTIVE_FLAGS_PATH), { recursive: true });
    fs.writeFileSync(ACTIVE_FLAGS_PATH, JSON.stringify(flags, null, 2), 'utf8');
    console.log(`  [flags] wrote ${Object.keys(flags).length} flag(s) to ${ACTIVE_FLAGS_PATH}`);
}

/** The app id for the current session's platform. */
export function currentAppId(): string {
    return browser.isIOS ? IOS_BUNDLE_ID : ANDROID_APP_PACKAGE;
}

/**
 * Writes the flags, then relaunches the app so its SDK fetches them. A relaunch, not a
 * background/foreground cycle: most remote-config SDKs fetch once at startup.
 */
export async function restartAppWithFlags(flags: FeatureFlags): Promise<void> {
    writeFlags(flags);
    await restartApp();
}

/** Terminates and relaunches the app under test. */
export async function restartApp(): Promise<void> {
    const appId = currentAppId();
    if (!appId) {
        throw new Error(
            'No app id configured. Set IOS_BUNDLE_ID / ANDROID_APP_PACKAGE in .env — see config/app.config.ts.'
        );
    }

    await browser.terminateApp(appId);
    await browser.activateApp(appId);
}
