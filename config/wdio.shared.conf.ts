import fs from 'node:fs';
import type { Frameworks } from '@wdio/types';
import { maskingPatternsFromEnv } from '../test/helpers/logMasking.js';

/**
 * The parts of a wdio config that do not depend on platform or runner. The three concrete
 * configs spread this and override what differs, so reporters, timeouts and the failure
 * hook cannot drift apart.
 */

// Step counter for the progress hooks. The `spec` reporter prints only once the whole file
// finishes, which leaves a multi-minute mobile run showing nothing in between.
let stepIndex = 0;

/** Directory failure screenshots land in, named after the failing case. */
export const RESULTS_DIR = './test-results';

/** Artefact directories wiped at the start of every run. */
export const ARTEFACT_DIRS = ['allure-results', RESULTS_DIR];

/**
 * Deletes artefacts from the previous run. Allure *appends* to `allure-results`, so without
 * this a summary reports the union of every run since the last manual clean.
 */
export function cleanArtefacts(): void {
    for (const dir of ARTEFACT_DIRS) {
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * Saves a screenshot of the screen a failing test died on, named after the case so it can be
 * found without timestamp archaeology.
 *
 * Never throws: the usual reason a screenshot fails is a dead session, and that would
 * otherwise surface as a hook error on top of the real failure.
 */
export async function saveFailureScreenshot(test: Frameworks.Test, label?: string): Promise<void> {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        // For a hook failure, `test.title` is Mocha's own decorated hook title (e.g.
        // `"before all" hook for "should sign in"` — mocha/lib/runner.js sets this on the
        // Hook object itself, which is what afterHook receives here as `test`). That is
        // accurate but not filename-friendly, so `label` (the clean `hookName`) replaces it
        // rather than joining alongside it.
        const name = [test.parent, label || test.title].filter(Boolean).join('--')
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .substring(0, 120) || 'unknown';

        if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
        await browser.saveScreenshot(`${RESULTS_DIR}/${name}--${timestamp}.png`);
    } catch (error) {
        console.warn(`  [screenshot] could not capture the failure: ${(error as Error).message}`);
    }
}

/** Progress hooks, shared so every config prints the same step lines. */
export const progressHooks = {
    beforeSuite() {
        stepIndex = 0;
    },
    beforeTest(test: Frameworks.Test) {
        stepIndex += 1;
        console.log(`\n▶ [${stepIndex}] ${test.title}`);
    },
    async afterTest(test: Frameworks.Test, _context: unknown, { passed, duration }: Frameworks.TestResult) {
        console.log(`${passed ? '✓' : '✖'} [${stepIndex}] ${test.title} (${(duration / 1000).toFixed(1)}s)`);
        if (!passed) await saveFailureScreenshot(test);
    },
    /**
     * A failing `before`/`beforeEach` never reaches afterTest, so without this the setup
     * failures — the ones guardrail #2 most wants a picture of — produce no screenshot.
     *
     * No dedup against afterTest is needed: when a setup hook throws, mocha aborts the
     * dependent test without running its body, so WDIO's afterTest (wired through the test
     * body) never fires for it — this hook is the only screenshot that failure produces.
     *
     * A failure during session creation still cannot produce one: there is no session to
     * capture from.
     */
    async afterHook(
        test: Frameworks.Test,
        _context: unknown,
        result: Frameworks.TestResult,
        hookName: string,
    ) {
        if (result.passed) return;
        console.log(`✖ hook failed: ${hookName}`);
        await saveFailureScreenshot(test, hookName);
    },
};

/** Base config. Spread first, then override. */
export const sharedConfig = {
    runner: 'local',

    maxInstances: 1,

    logLevel: process.env.WDIO_LOG_LEVEL || 'info',
    // Here rather than per-config: the `webdriver` logger prints every command's arguments
    // at `info`, so a config that forgets it leaks whatever was typed into a secure field.
    maskingPatterns: maskingPatternsFromEnv(),

    // Run-level: stop after one failed spec *file*. Mobile suites share one device and
    // usually one account state, so a failure part-way through invalidates what follows.
    // Distinct from mocha's own `bail` (see wdio.ios.cloud.conf.ts), which stops at the
    // first failing `it()` inside a file — the two compose, they do not overlap.
    bail: 1,

    waitforTimeout: 10000,
    // Generous: real-device session creation (WDA build/launch) can legitimately take
    // minutes.
    connectionRetryTimeout: 300000,
    connectionRetryCount: 3,

    framework: 'mocha',

    // Off on purpose. A retried mobile spec re-enters the app in whatever state the failed
    // attempt left it, and a purchase flow must never be replayed automatically.
    specFileRetries: 0,

    reporters: [
        'spec',
        ['allure', {
            outputDir: 'allure-results',
            disableWebdriverStepsReporting: false,
            disableWebdriverScreenshotsReporting: false,
        }],
    ],

    mochaOpts: {
        ui: 'bdd',
        timeout: 300000,
    },

    ...progressHooks,
};
