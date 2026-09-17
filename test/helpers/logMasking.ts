/**
 * Builds `maskingPatterns` for the wdio configs, so secrets read out of `.env` never reach a
 * log file.
 *
 * wdio's `webdriver` logger prints every command's arguments at `info`, and credentials go
 * in through `elementSendKeys` — so an uploaded CI log carries them. This masks the secret's
 * *value*, not the command shape: matching on `elementSendKeys` would also hide the test
 * phone number and OTP, which are useful in a log.
 *
 * @see https://webdriver.io/docs/configuration#maskingpatterns
 */

/**
 * Env vars whose values must never appear in a log. Keep it short and genuine — a static
 * test OTP is not a secret, and masking it costs diagnostic value.
 *
 * Covers `@wdio/logger` output only, **not** `console.log`. Extend per project with
 * `EXTRA_SECRET_ENV_VARS` in `.env`.
 */
export const SECRET_ENV_VARS = Object.freeze([
    'IOS_SANDBOX_APPLE_PAY_PASSWORD',
    'IOS_SIM_APPLE_PASSWORD',
    // The account is half of a login, and it is typed into the alert with `setValue`, so it
    // reaches the webdriver log exactly like the password does.
    'IOS_SANDBOX_ACCOUNT',
    'IOS_SIM_APPLE_ID',
    'TEST_PASSWORD',
    'CLOUD_ACCESS_KEY',
]);

/**
 * Redacts an account for something `maskingPatterns` cannot reach — a `console.log`, or an
 * error message that ends up in the Allure report.
 *
 * Keeps the first character and the domain, which is enough to confirm *which* account was
 * used without publishing it: `sandbox-tester@example.com` -> `s***@example.com`.
 */
export function redactAccount(value: string | undefined): string {
    if (!value) return '(unset)';
    const at = value.indexOf('@');
    if (at > 0) return `${value[0]}***${value.slice(at)}`;
    return `${value[0]}***`;
}

/**
 * Escapes a literal string for a `maskingPatterns` entry: regex metacharacters, and commas.
 * wdio splits the whole string on commas before parsing any regex, so a raw comma in a
 * secret would tear its pattern into two halves that still compile — failing silently while
 * the secret goes on being logged.
 */
function toLiteralPattern(value: string): string {
    return value
        .replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
        .replace(/,/g, '\\x2C');
}

/**
 * @returns {string|undefined} A `maskingPatterns` string, or undefined when no secret is set
 *   (wdio treats a non-string as "no masking").
 */
/** Every configured secret's actual value. One source for both masking paths below. */
function secretValues(env: NodeJS.ProcessEnv): string[] {
    const extra = (env.EXTRA_SECRET_ENV_VARS || '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);

    return [...new Set([...SECRET_ENV_VARS, ...extra])]
        .map((name) => env[name])
        .filter((value): value is string => typeof value === 'string' && value.length > 0);
}

export function maskingPatternsFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
    const patterns = secretValues(env)
        // `g` matters: one log line can hold the value twice (COMMAND and its DATA).
        .map((value) => `/${toLiteralPattern(value)}/g`);

    return patterns.length ? patterns.join(',') : undefined;
}

/**
 * Strips every configured secret out of arbitrary text.
 *
 * For the paths `maskingPatterns` cannot reach: `console.log`, and error messages that end
 * up in Allure's statusDetails and from there in the published CI report.
 *
 * The case this exists for is a system dialog echoing the account back at us — iOS renders
 * the StoreKit password prompt as `Enter the password for "tester@example.com"` — so logging
 * an alert verbatim would republish the very value SECRET_ENV_VARS exists to keep out.
 * Redact before truncating, or a slice boundary can leave a fragment behind.
 */
export function redactSecrets(text: string, env: NodeJS.ProcessEnv = process.env): string {
    return secretValues(env).reduce((out, value) => out.split(value).join('***'), text);
}
