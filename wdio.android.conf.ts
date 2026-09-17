import 'dotenv/config';
import { sharedConfig, cleanArtefacts } from './config/wdio.shared.conf.js';
import {
    ANDROID_APP_PACKAGE, ANDROID_APP_ACTIVITY, resolveAndroidApp, requireEnv,
} from './config/app.config.js';
import type { Frameworks, Reporters } from '@wdio/types';
import { applyCheckArgToEnv } from './test/helpers/preflight.js';
// Registers the project's pre-flight checks, so `--check <name>` resolves. See
// wdio.ios.conf.ts for why this import has to come before applyCheckArgToEnv().
import './test/checks.js';

/**
 * Android — local Appium, against an emulator or a connected device.
 *
 * See `wdio.ios.conf.ts` for anything shared; this file documents only what is
 * Android-specific.
 */

const REQUESTED_CHECKS = applyCheckArgToEnv();

const ANDROID_APP = resolveAndroidApp();

export const config = {
    ...sharedConfig,

    port: 4723,

    specs: [
        './test/android/specs/**/*.spec.ts',
    ],

    // No `exclude` here on purpose: in wdio, `exclude` beats `--spec`, so anything listed
    // becomes unrunnable even explicitly. Things that must stay out of a suite run live
    // outside the glob above instead — test/preflight/ and test/<platform>/debug/.

    capabilities: [{
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        'appium:deviceName': process.env.ANDROID_DEVICE_NAME || 'emulator-5554',
        'appium:udid': process.env.ANDROID_UDID || 'emulator-5554',
        'appium:platformVersion': process.env.ANDROID_PLATFORM_VERSION,

        'appium:appPackage': ANDROID_APP_PACKAGE,
        'appium:appActivity': ANDROID_APP_ACTIVITY,
        ...(ANDROID_APP && { 'appium:app': ANDROID_APP }),

        // The launcher activity often hands off to another one before the UI settles;
        // matching any activity avoids a false "app never started".
        'appium:appWaitActivity': '*',

        'appium:noReset': process.env.ANDROID_NO_RESET === 'true',
        'appium:newCommandTimeout': 300,

        // Animations are the main source of tap-before-ready flake on an emulator.
        'appium:disableWindowAnimation': true,

        // Off, so permission dialogs stay part of the flow under test.
        'appium:autoGrantPermissions': process.env.ANDROID_AUTO_GRANT_PERMISSIONS === 'true',
    }],

    services: [['appium', {
        args: { logLevel: process.env.APPIUM_LOG_LEVEL || 'info' },
    }]],

    reporters: [
        ...sharedConfig.reporters,
        ['junit', {
            outputDir: './test-results/android/',
            outputFileFormat: (options: Reporters.Options) => `results-${options.cid}.xml`,
        }],
    ],

    onPrepare: async function () {
        if (REQUESTED_CHECKS) {
            console.log(`Pre-flight checks (--check): ${REQUESTED_CHECKS.length ? REQUESTED_CHECKS.join(', ') : 'none'}`);
        }

        cleanArtefacts();
        requireEnv(['ANDROID_APP_PACKAGE', 'ANDROID_APP_ACTIVITY']);

        console.log(ANDROID_APP
            ? `App under test: ${ANDROID_APP}`
            : `App under test: already-installed ${ANDROID_APP_PACKAGE} (no binary given)`);
    },

    // Android can record the screen through adb, which is worth having on a failure — the
    // emulator's flake is usually a timing problem a still frame cannot show.
    beforeTest: async function (test: Frameworks.Test) {
        sharedConfig.beforeTest(test);

        // Best-effort: an emulator without the right codec fails here, and losing the video
        // must not lose the test.
        await browser.startRecordingScreen({ videoSize: '720x1280' }).catch((err) => {
            console.warn(`  [video] could not start recording: ${err.message}`);
        });
    },

    afterTest: async function (test: Frameworks.Test, context: unknown, results: Frameworks.TestResult) {
        const video = await browser.stopRecordingScreen().catch(() => null);

        if (!results.passed && typeof video === 'string' && video.length) {
            const fs = await import('node:fs');
            const dir = './test-results/android/videos';
            const slug = test.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(`${dir}/${slug}.mp4`, video, 'base64');
            console.log(`  [video] saved ${dir}/${slug}.mp4`);
        }

        await sharedConfig.afterTest(test, context, results);
    },

    after: async function () {
        try {
            if (ANDROID_APP_PACKAGE) await browser.terminateApp(ANDROID_APP_PACKAGE);
        } catch {
            // Best-effort cleanup.
        }
    },
};
