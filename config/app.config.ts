import fs from 'node:fs';
import path from 'node:path';

/**
 * The one place the app under test is identified. Capabilities, the `after` hooks and the
 * feature-flag restart all read from here, so porting to another app is an `.env` edit.
 */

/** Human-readable name; used for the simulator .app filename and cloud build labels. */
export const APP_NAME = process.env.APP_NAME || 'App';

/** iOS bundle identifier, e.g. `com.example.myapp`. */
export const IOS_BUNDLE_ID = process.env.IOS_BUNDLE_ID || '';

/** Android application id, e.g. `com.example.myapp`. */
export const ANDROID_APP_PACKAGE = process.env.ANDROID_APP_PACKAGE || '';

/** Fully-qualified launcher activity. */
export const ANDROID_APP_ACTIVITY = process.env.ANDROID_APP_ACTIVITY || '';

/**
 * Resolves the iOS binary to install. `undefined` is a supported result, not a failure: with
 * no `appium:app`, Appium launches whatever is installed under `IOS_BUNDLE_ID`.
 */
export function resolveIosApp(): string | undefined {
    if (process.env.IOS_APP_PATH) return process.env.IOS_APP_PATH;

    const candidates = ['./apps/app.ipa', `./apps/${APP_NAME}.app`, './apps/app.app'];
    return candidates.find((candidate) => fs.existsSync(candidate));
}

/**
 * Resolves the Android binary to install, or undefined when the run should use the
 * already-installed app (`ANDROID_USE_INSTALLED_APP=true`).
 */
export function resolveAndroidApp(): string | undefined {
    if (process.env.ANDROID_USE_INSTALLED_APP === 'true') return undefined;

    const candidate = process.env.ANDROID_APP_PATH || './apps/app.apk';
    return fs.existsSync(candidate) ? candidate : undefined;
}

/**
 * Build provenance stamped next to a simulator build by `scripts/refresh-ios-sim-app.sh`, so
 * a surprising result traces back to its binary. Null when no stamp exists.
 */
export function readAppBuildInfo(): string | null {
    const stamp = path.join('apps', `${APP_NAME}.app.buildinfo`);
    if (!fs.existsSync(stamp)) return null;
    return fs.readFileSync(stamp, 'utf8').trim().split('\n').join(' ');
}

/**
 * Throws unless every named variable is set. Call it from `onPrepare`, before a device
 * session is spent.
 */
export function requireEnv(names: string[]): void {
    const missing = names.filter((name: string) => !process.env[name]);
    if (missing.length) {
        throw new Error(
            `Missing required .env variable(s): ${missing.join(', ')}. See .env.example.`
        );
    }
}
