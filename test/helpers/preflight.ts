/**
 * Pre-flight checks: things a run can be gated on *before* it leases a device.
 *
 * A real-device flow can hold the device for fifteen minutes, and what usually makes it
 * unrunnable — a dead test account, a subscription still active — is knowable up front.
 *
 * The framework ships the mechanism and no checks; register your project's in
 * `test/checks.ts`. `needsDriver` splits the two run paths: without it a check runs
 * in-process from `scripts/preflight.ts`; with it that script shells out to
 * `test/preflight/driver-checks.spec.ts`, so capabilities and WDA handling stay owned by
 * the wdio config.
 */

/** One registered check. `needsDriver` decides which of the two run paths it takes. */
export interface PreflightCheck {
    needsDriver: boolean;
    timeout: number;
    summary: string;
    run: () => Promise<unknown>;
}

/** What `registerCheck` accepts; the defaults are filled in there. */
export type PreflightCheckInput =
    Partial<Pick<PreflightCheck, 'needsDriver' | 'timeout'>>
    & Pick<PreflightCheck, 'summary' | 'run'>;

export const PREFLIGHT_CHECKS: Record<string, PreflightCheck> = {};

/**
 * @param {string} name - Short, lowercase; becomes the `--check` vocabulary and the
 *   `SKIP_<NAME>_CHECK` env var.
 * @param {object} check - `{ needsDriver = false, timeout = 30000, summary, run }`. The
 *   timeout is so a slow check fails on its own message, not a generic mocha timeout.
 */
export function registerCheck(
    name: string,
    { needsDriver = false, timeout = 30000, summary, run }: PreflightCheckInput,
): void {
    if (!summary || typeof run !== 'function') {
        throw new Error(`registerCheck(${name}): both summary and run are required.`);
    }
    PREFLIGHT_CHECKS[name] = { needsDriver, timeout, summary, run };
}

/** Check names currently registered. Read after your project's check module is imported. */
export const checkNames = (): string[] => Object.keys(PREFLIGHT_CHECKS);

/** The env var that turns one check off. */
const skipEnvVar = (name: string): string => `SKIP_${name.toUpperCase()}_CHECK`;

/**
 * Resolves a `--check` value into the set of checks to enable. The value names *everything*
 * that should run, so `--check sandbox` means "sandbox only".
 *
 * Unknown names throw rather than being ignored: a mistyped skip variable once quietly
 * dropped eight cases from a run that could have run them.
 *
 * @param {string} raw - Names, `all`, or `none`
 */
export function parseCheckList(raw: string): string[] {
    const names = checkNames();
    const value = String(raw ?? '').trim();

    if (!value) {
        throw new Error(`--check needs a value: ${names.join(', ') || '(no checks registered)'}, all, or none.`);
    }
    if (value === 'none') return [];
    if (value === 'all') return [...names];

    const requested = value.split(',').map((s) => s.trim()).filter(Boolean);
    const unknown = requested.filter((n) => !names.includes(n));

    if (unknown.length) {
        throw new Error(
            `Unknown --check value(s): ${unknown.join(', ')}. `
            + `Valid: ${names.join(', ') || '(none registered — is test/checks.ts imported?)'}, all, none.`
        );
    }
    return requested;
}

/**
 * Reads `--check <value>` / `--check=<value>` out of argv.
 * @returns {string[]|null} The enabled set, or null when the flag is absent
 */
export function parseCheckArg(argv: string[] = process.argv): string[] | null {
    const index = argv.findIndex((arg) => arg === '--check' || arg.startsWith('--check='));
    if (index === -1) return null;

    const arg = argv[index];
    const raw = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[index + 1];

    // `--check --spec foo` would otherwise swallow the next flag as the value.
    if (raw === undefined || raw.startsWith('-')) {
        throw new Error(`--check needs a value: ${checkNames().join(', ')}, all, or none.`);
    }
    return parseCheckList(raw);
}

/**
 * Translates `--check` into the `SKIP_*_CHECK` variables. Call it from a wdio config at
 * module scope, after importing `test/checks.ts` so the names resolve.
 *
 * Module scope is load-bearing: a throw from `onPrepare` does not abort a wdio run — it is
 * logged as "Error in hook" and the run carries on, so a typo would still lease the device.
 *
 * @returns {string[]|null} The enabled set, or null when no `--check` was given
 */
export function applyCheckArgToEnv(
    argv: string[] = process.argv,
    env: NodeJS.ProcessEnv = process.env,
): string[] | null {
    const selected = parseCheckArg(argv);
    if (selected === null) return null;

    for (const name of checkNames()) {
        env[skipEnvVar(name)] = String(!selected.includes(name));
    }
    return selected;
}

/**
 * Whether a check should run, from a worker's point of view. An explicitly set
 * `SKIP_*_CHECK` wins; otherwise `defaultEnabled` applies.
 */
export function isCheckEnabled(name: string, defaultEnabled: boolean): boolean {
    const raw = process.env[skipEnvVar(name)];
    if (raw === undefined || raw === '') return defaultEnabled;
    return raw !== 'true';
}
