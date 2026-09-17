#!/usr/bin/env tsx
/**
 * Runs the pre-flight checks on their own, without running a flow.
 *
 * Usage:
 *   npm run preflight                   # every registered check
 *   npm run preflight -- account        # one check
 *   npm run preflight -- account,sub    # several
 *
 * Checks are routed by `needsDriver` (see test/helpers/preflight.ts): plain ones run in this
 * process, driver-backed ones go through `wdio run --spec test/preflight/driver-checks.spec.ts`
 * so capabilities, signing and WDA handling stay owned by wdio.ios.conf.ts.
 *
 * Register your project's checks in `test/checks.ts`.
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { PREFLIGHT_CHECKS, checkNames, parseCheckList } from '../test/helpers/preflight.js';
import '../test/checks.js';

const args = process.argv.slice(2).filter(Boolean);

if (checkNames().length === 0) {
    console.log(
        'No pre-flight checks are registered.\n'
        + 'Add them in test/checks.ts — see that file for what makes a good one.'
    );
    process.exit(0);
}

let selected;
try {
    // Bare names rather than `--check x`: this script's whole job is running checks.
    // `parseCheckList` still owns the vocabulary, so `all` / `none` / unknown names behave
    // identically to the flag.
    selected = args.length ? parseCheckList(args.join(',')) : [...checkNames()];
} catch (error) {
    // A mistyped name is user input, not a bug — a stack trace would bury the message.
    console.error(`\n✖ ${(error as Error).message}`);
    process.exit(1);
}

if (!selected.length) {
    console.log('Nothing to run.');
    process.exit(0);
}

const inProcess = selected.filter((name) => !PREFLIGHT_CHECKS[name].needsDriver);
const needDriver = selected.filter((name) => PREFLIGHT_CHECKS[name].needsDriver);

const failures = [];

for (const name of inProcess) {
    const check = PREFLIGHT_CHECKS[name];
    console.log(`\n▶ ${name} — ${check.summary}`);
    try {
        await check.run();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✖ ${name}\n${(error as Error).message}`);
        failures.push(name);
    }
}

// One wdio run for all driver-backed checks rather than one per check: the session is what
// costs the time, and driver-checks.spec.ts already reads --check to decide which to run.
if (needDriver.length) {
    console.log(`\n▶ ${needDriver.join(', ')} — starting a wdio session (this needs the device)`);
    const result = spawnSync(
        'npx',
        [
            'wdio', 'run', './wdio.ios.conf.ts',
            '--spec', 'test/preflight/driver-checks.spec.ts',
            '--check', needDriver.join(','),
        ],
        // No NODE_OPTIONS override: this spawns `npx wdio run`, and @wdio/cli detects the
        // .ts config itself and injects tsx's loader before it does anything else.
        { stdio: 'inherit', shell: false },
    );
    if (result.status !== 0) failures.push(...needDriver);
}

if (failures.length) {
    console.error(`\n✖ Pre-flight failed: ${failures.join(', ')}`);
    process.exit(1);
}

console.log(`\n✓ Pre-flight passed: ${selected.join(', ')}`);
