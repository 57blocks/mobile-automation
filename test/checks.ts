/**
 * Your project's pre-flight checks. The framework ships the mechanism and none of its own.
 *
 * Imported by `scripts/preflight.ts`, `test/preflight/driver-checks.spec.ts` and every wdio
 * config, so a check registered here reaches all of them — including `--check`.
 *
 * A good check (a) makes the run unrunnable, (b) is knowable before the device is leased,
 * and (c) has already wasted somebody's time once. Make the thrown message name the remedy.
 *
 *     import { registerCheck } from './helpers/preflight.js';
 *
 *     registerCheck('account', {
 *         summary: 'the seeded test account still exists',
 *         run: async () => { ... },                    // no device, runs in ~1 s
 *     });
 *
 *     registerCheck('subscription', {
 *         needsDriver: true,                           // runs via driver-checks.spec.ts
 *         timeout: 180000,
 *         summary: 'the sandbox account holds no active subscription',
 *         run: () => SandboxAccountPage.assertNoActiveSubscription(),
 *     });
 */

export {};
