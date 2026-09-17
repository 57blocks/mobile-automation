import 'dotenv/config';
import { sharedConfig, cleanArtefacts } from './config/wdio.shared.conf.js';
import {
    IOS_BUNDLE_ID, resolveIosApp, readAppBuildInfo, requireEnv,
} from './config/app.config.js';
import { killOrphanedWdaBuilds } from './test/helpers/wdaCleanup.js';
import { applyCheckArgToEnv } from './test/helpers/preflight.js';
// Registers the project's pre-flight checks. Required before applyCheckArgToEnv() below:
// without it the registry is empty and every `--check <name>` is rejected as unknown.
import './test/checks.js';

/**
 * iOS — local Appium, against a simulator or a real device.
 *
 * Which one you get is decided by `.env`: `scripts/run-ios-sim.sh` blanks the real-device
 * variables and exports the booted simulator's UDID for the run.
 */

// `--check <names|all|none>` names the complete set of checks to run; anything unnamed is
// off. Writes the SKIP_*_CHECK variables, which workers inherit via `process.env`.
//
// At module scope, not in onPrepare: a throw from onPrepare does NOT abort a wdio run, so a
// `--check badname` typo would still lease the device. A throw at module load does abort.
const REQUESTED_CHECKS = applyCheckArgToEnv();

const IOS_APP = resolveIosApp();

export const config = {
    ...sharedConfig,

    port: 4723,

    // Keep any spec with a one-way side effect — a real purchase, an account deletion — out
    // of this list and run it explicitly with --spec.
    specs: [
        './test/ios/specs/**/*.spec.ts',
    ],

    // No `exclude` here on purpose: in wdio, `exclude` beats `--spec`, so anything listed
    // becomes unrunnable even explicitly. Things that must stay out of a suite run live
    // outside the glob above instead — test/preflight/ and test/<platform>/debug/.

    // Named subsets. `simulator` is the conventional one: everything that can pass without a
    // real device (no Apple Pay sandbox, no push, no camera). Fill it in as specs are added.
    suites: {
        simulator: [],
    },

    capabilities: [{
        platformName: 'iOS',
        'appium:automationName': 'XCUITest',
        'appium:deviceName': process.env.IOS_DEVICE_NAME,
        'appium:udid': process.env.IOS_UDID,
        'appium:platformVersion': process.env.IOS_PLATFORM_VERSION,

        // With no `appium:app`, Appium launches whatever is already installed under the
        // bundle id — the fast path when the build has not changed.
        ...(IOS_APP && process.env.IOS_NO_RESET !== 'true' && { 'appium:app': IOS_APP }),
        'appium:bundleId': IOS_BUNDLE_ID,
        'appium:noReset': process.env.IOS_NO_RESET === 'true',

        // Skips the WDA *build*, still runs it through xcodebuild.
        'appium:usePrebuiltWDA': process.env.IOS_USE_PREBUILT_WDA === 'true',

        // Launches the WDA runner already installed on the device instead of driving it
        // through xcodebuild. Distinct from `usePrebuiltWDA` above, and what stops a failed
        // session from uninstalling the runner — which costs a manual re-trust on the phone
        // before the next run. See docs/ARCHITECTURE.md, "Known iOS pitfalls".
        //
        // Requires the runner to be installed and trusted once (`updatedWDABundleId` names
        // it). Also the fastest startup path: no build, no xcodebuild test run.
        'appium:usePreinstalledWDA': process.env.IOS_USE_PREINSTALLED_WDA === 'true',
        ...(process.env.IOS_PREBUILT_WDA_PATH && { 'appium:prebuiltWDAPath': process.env.IOS_PREBUILT_WDA_PATH }),

        // On by default. It reaches system alerts our own queries cannot. Turn it off only
        // for a flow that must decide per alert — read test/helpers/alerts.ts first.
        'appium:autoAcceptAlerts': process.env.IOS_AUTO_ACCEPT_ALERTS !== 'false',

        'appium:wdaLaunchTimeout': 300000,
        'appium:newCommandTimeout': 300,

        // Real device only: required for WebDriverAgent code signing.
        // https://appium.github.io/appium-xcuitest-driver/latest/preparation/real-device-config/
        ...(process.env.IOS_XCODE_ORG_ID && {
            'appium:xcodeOrgId': process.env.IOS_XCODE_ORG_ID,
            'appium:xcodeSigningId': process.env.IOS_XCODE_SIGNING_ID || 'Apple Development',
            ...(process.env.IOS_UPDATED_WDA_BUNDLE_ID && { 'appium:updatedWDABundleId': process.env.IOS_UPDATED_WDA_BUNDLE_ID }),
        }),

        // Surfaces xcodebuild errors in the Appium log when a WDA build fails.
        ...(process.env.SHOW_XCODE_LOG === 'true' && { 'appium:showXcodeLog': true }),
    }],

    services: [['appium', {
        args: { logLevel: process.env.APPIUM_LOG_LEVEL || 'info' },
    }]],

    /** Runs once in the launcher process, before any worker starts. */
    onPrepare: async function () {
        if (REQUESTED_CHECKS) {
            console.log(`Pre-flight checks (--check): ${REQUESTED_CHECKS.length ? REQUESTED_CHECKS.join(', ') : 'none'}`);
        }

        // A cancelled run leaves its xcodebuild WebDriverAgentRunner holding the device's
        // only XCTest session, which fails the next session with XCTDaemonErrorDomain
        // Code=41. Clear it before anything else.
        await killOrphanedWdaBuilds();

        cleanArtefacts();

        requireEnv(['IOS_BUNDLE_ID', 'IOS_DEVICE_NAME', 'IOS_UDID', 'IOS_PLATFORM_VERSION']);

        const buildInfo = readAppBuildInfo();
        console.log(IOS_APP
            ? `App under test: ${IOS_APP}${buildInfo ? ` (${buildInfo})` : ''}`
            : `App under test: already-installed ${IOS_BUNDLE_ID} (no binary given)`);
    },

    after: async function () {
        try {
            if (IOS_BUNDLE_ID) await browser.terminateApp(IOS_BUNDLE_ID);
        } catch {
            // Best-effort: a dead session here must not fail an otherwise-green run.
        }
    },
};
