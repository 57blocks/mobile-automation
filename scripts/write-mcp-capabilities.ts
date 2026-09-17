#!/usr/bin/env tsx
/**
 * Generates the capabilities.json that appium-mcp reads, from the same `.env` the wdio
 * configs use.
 *
 * Hand-writing that file would make it a second place the app under test is identified,
 * which is the drift `config/app.config.ts` exists to prevent. Run by
 * `scripts/appium-mcp.sh` on every server launch, so it cannot go stale.
 *
 * The session this configures is for *inspecting* a running app to find locators, so it
 * differs from a test run on purpose — see the comments on each capability.
 *
 * Uses Node's built-in `loadEnvFile` rather than dotenv — same precedence (a value already
 * in the environment wins over the file) with one less thing to resolve. It is run through
 * `npx tsx` by scripts/appium-mcp.sh, so it does need node_modules installed; before the
 * TypeScript migration it did not.
 */
import fs from 'node:fs';
import path from 'node:path';

try {
    process.loadEnvFile('.env');
} catch {
    console.error('[appium-mcp] no .env found — capabilities will only carry what is already in the environment');
}

import {
    IOS_BUNDLE_ID, ANDROID_APP_PACKAGE, ANDROID_APP_ACTIVITY,
    resolveIosApp, resolveAndroidApp,
} from '../config/app.config.js';

const OUT = path.resolve('test/fixtures/mcp/capabilities.json');

// Off by default: an inspection session should attach to the build already on the device.
// Reinstalling wipes the state you were about to look at.
const INSTALL_APP = process.env.MCP_INSTALL_APP === 'true';

const iosApp = INSTALL_APP ? resolveIosApp() : undefined;
const androidApp = INSTALL_APP ? resolveAndroidApp() : undefined;

const ios = {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    ...(process.env.IOS_DEVICE_NAME && { 'appium:deviceName': process.env.IOS_DEVICE_NAME }),
    ...(process.env.IOS_UDID && { 'appium:udid': process.env.IOS_UDID }),
    ...(process.env.IOS_PLATFORM_VERSION && { 'appium:platformVersion': process.env.IOS_PLATFORM_VERSION }),
    ...(IOS_BUNDLE_ID && { 'appium:bundleId': IOS_BUNDLE_ID }),
    ...(iosApp && { 'appium:app': path.resolve(iosApp) }),

    // Never reset while inspecting.
    'appium:noReset': true,

    // Off even though the wdio default is on: the point of a live session is to see what is
    // actually on screen, and that includes the alerts a test run would have swallowed.
    'appium:autoAcceptAlerts': false,

    // Same reasoning as wdio.ios.conf.ts: without it a failed session uninstalls the runner,
    // and the next one needs a manual re-trust on the phone.
    'appium:usePreinstalledWDA': process.env.IOS_USE_PREINSTALLED_WDA === 'true',
    // Same as the wdio config: skip the WDA build when the runner is already built.
    'appium:usePrebuiltWDA': process.env.IOS_USE_PREBUILT_WDA === 'true',
    ...(process.env.IOS_PREBUILT_WDA_PATH && { 'appium:prebuiltWDAPath': process.env.IOS_PREBUILT_WDA_PATH }),

    'appium:wdaLaunchTimeout': 300000,
    // Generous: an inspection session sits idle while its locators are being read.
    'appium:newCommandTimeout': 600,

    // Real device only — WebDriverAgent code signing.
    ...(process.env.IOS_XCODE_ORG_ID && {
        'appium:xcodeOrgId': process.env.IOS_XCODE_ORG_ID,
        'appium:xcodeSigningId': process.env.IOS_XCODE_SIGNING_ID || 'Apple Development',
        ...(process.env.IOS_UPDATED_WDA_BUNDLE_ID && { 'appium:updatedWDABundleId': process.env.IOS_UPDATED_WDA_BUNDLE_ID }),
    }),
};

const android = {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    ...(process.env.ANDROID_DEVICE_NAME && { 'appium:deviceName': process.env.ANDROID_DEVICE_NAME }),
    ...(process.env.ANDROID_UDID && { 'appium:udid': process.env.ANDROID_UDID }),
    ...(process.env.ANDROID_PLATFORM_VERSION && { 'appium:platformVersion': process.env.ANDROID_PLATFORM_VERSION }),
    ...(ANDROID_APP_PACKAGE && { 'appium:appPackage': ANDROID_APP_PACKAGE }),
    ...(ANDROID_APP_ACTIVITY && { 'appium:appActivity': ANDROID_APP_ACTIVITY }),
    ...(androidApp && { 'appium:app': path.resolve(androidApp) }),

    'appium:appWaitActivity': '*',
    'appium:noReset': true,
    'appium:newCommandTimeout': 600,
    'appium:disableWindowAnimation': true,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ ios, android }, null, 2), 'utf8');

// stderr, not stdout: stdout is the MCP stdio transport.
console.error(
    `[appium-mcp] capabilities written to ${OUT}`
    + ` (iOS ${IOS_BUNDLE_ID || 'unset'} on ${process.env.IOS_UDID || 'no UDID'};`
    + ` app install ${INSTALL_APP ? 'on' : 'off'})`
);
