import 'dotenv/config';
import { sharedConfig, cleanArtefacts } from './config/wdio.shared.conf.js';
import { APP_NAME, IOS_BUNDLE_ID, requireEnv } from './config/app.config.js';
import { applyCheckArgToEnv } from './test/helpers/preflight.js';
// Registers the project's pre-flight checks, so `--check <name>` resolves. See
// wdio.ios.conf.ts for why this import has to come before applyCheckArgToEnv().
import './test/checks.js';

/**
 * iOS on a real-device cloud (LambdaTest / TestMu AI).
 *
 * Written against LambdaTest's mobile hub; the shape is the same for BrowserStack and Sauce
 * Labs, so porting is mostly renaming `lt:options`.
 *
 * Differences from the local config:
 *  - No Appium service — the hub runs the server.
 *  - No WDA capabilities — signing, tunnels and the runner are the hub's problem.
 *  - `autoAcceptAlerts` defaults to OFF here (opt in with `IOS_AUTO_ACCEPT_ALERTS=true`),
 *    the reverse of the local default: cloud pools vary in what their own alert handling
 *    does, and silently-accepted alerts are hard to debug from a video.
 *  - The final status has to be reported back in `after`, or the dashboard shows every
 *    session as "completed" regardless of the result.
 */

const REQUESTED_CHECKS = applyCheckArgToEnv();

// Read once and forwarded to workers: the value has to be identical in the launcher (which
// builds capabilities) and in the specs (which branch on it).
const AUTO_ACCEPT_ALERTS = process.env.IOS_AUTO_ACCEPT_ALERTS === 'true';
process.env.IOS_AUTO_ACCEPT_ALERTS = String(AUTO_ACCEPT_ALERTS);

const capabilities = [{
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:bundleId': IOS_BUNDLE_ID,
    'appium:autoAcceptAlerts': AUTO_ACCEPT_ALERTS,
    'appium:wdaLaunchTimeout': 300000,
    'appium:newCommandTimeout': 300,

    'lt:options': {
        user: process.env.CLOUD_USERNAME,
        accessKey: process.env.CLOUD_ACCESS_KEY,
        w3c: true,
        isRealMobile: true,
        deviceName: process.env.CLOUD_IOS_DEVICE_NAME || 'iPhone 15 Pro',
        platformVersion: process.env.CLOUD_IOS_PLATFORM_VERSION || '18',
        // Pins one exact device out of a private pool.
        ...(process.env.CLOUD_IOS_UDID && { udid: process.env.CLOUD_IOS_UDID }),
        // `lt://...` from `npm run cloud:upload-ios-app`. Every upload is its own app entry,
        // so this has to be updated in .env after each one.
        app: process.env.CLOUD_APP_ID,
        // Re-sign the .ipa with the hub's certificate. Leave it false unless an install fails.
        ...(process.env.CLOUD_RESIGN_APP !== undefined && { resignApp: process.env.CLOUD_RESIGN_APP === 'true' }),
        ...(process.env.CLOUD_PRIVATE_CLOUD === 'true' && { privateCloud: true }),
        build: process.env.CLOUD_BUILD_NAME || `${APP_NAME}-${process.env.USER || 'local'}`,
        name: `${APP_NAME} iOS (cloud real device)`,
        // The video is the only artefact that shows system UI the driver cannot see.
        video: true,
        network: true,
    },
}];

export const config = {
    ...sharedConfig,

    hostname: process.env.CLOUD_HOSTNAME || 'mobile-hub.lambdatest.com',
    port: 80,
    path: '/wd/hub',
    user: process.env.CLOUD_USERNAME,
    key: process.env.CLOUD_ACCESS_KEY,

    specs: [
        './test/ios/specs/**/*.spec.ts',
    ],

    // No `exclude` here on purpose: in wdio, `exclude` beats `--spec`, so anything listed
    // becomes unrunnable even explicitly. Things that must stay out of a suite run live
    // outside the glob above instead — test/preflight/ and test/<platform>/debug/.

    capabilities,

    // No `services` entry on purpose — the hub provides the Appium server.

    mochaOpts: {
        ...sharedConfig.mochaOpts,
        // Mocha-level, on top of the shared run-level `bail: 1`: stop at the first failing
        // `it()` rather than finishing the file. Cloud device minutes are metered.
        bail: true,
    },

    onPrepare: async function () {
        cleanArtefacts();

        requireEnv(['CLOUD_USERNAME', 'CLOUD_ACCESS_KEY', 'CLOUD_APP_ID', 'IOS_BUNDLE_ID']);

        const redacted = JSON.parse(JSON.stringify(capabilities));
        if (redacted[0]['lt:options']) {
            redacted[0]['lt:options'].user = '<redacted>';
            redacted[0]['lt:options'].accessKey = '<redacted>';
        }
        console.log('Cloud capabilities:', JSON.stringify(redacted, null, 2));

        // Lets a spec branch on the runner without sniffing capabilities. Set on
        // process.env, which is what workers inherit.
        process.env.RUNNING_ON_CLOUD = 'true';

        if (REQUESTED_CHECKS) {
            console.log(`Pre-flight checks (--check): ${REQUESTED_CHECKS.length ? REQUESTED_CHECKS.join(', ') : 'none'}`);
        }
    },

    /**
     * The hub decides a session's dashboard status from this hook, not the exit code.
     *
     * `result` is what @wdio/mocha-framework passes in: mocha's failing-test count, or an
     * Error for a runtime / spec-load failure. It is used rather than a flag maintained in
     * `afterTest`, because `afterTest` is wired through the test body and so never fires
     * when a `before` hook throws or a spec fails to import — both of which would otherwise
     * report a broken run to the dashboard as "passed".
     */
    after: async function (result: number | Error) {
        const passed = result === 0;
        try {
            await browser.execute(`lambda-hook: ${JSON.stringify({
                action: 'setTestStatus',
                arguments: {
                    status: passed ? 'passed' : 'failed',
                    remark: passed ? 'All steps passed' : `Run reported a failure (${String(result)})`,
                },
            })}`);
        } catch (err) {
            console.warn(`⚠  Failed to report test status to the cloud provider: ${(err as Error).message}`);
        }

        try {
            if (IOS_BUNDLE_ID) await browser.terminateApp(IOS_BUNDLE_ID);
        } catch {
            // Best-effort cleanup.
        }
    },
};
