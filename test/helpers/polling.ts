import type { ChainablePromiseElement } from 'webdriverio';
import { ELEMENT_TIMEOUT, POLL_INTERVAL } from './constants.js';

/**
 * Waiting primitives.
 *
 * `$$(...)`, `isDisplayed()` and `getAlertText()` are snapshots — they do not retry, so a
 * check written straight after an action answers before the UI has arrived. Use these
 * instead. See docs/ARCHITECTURE.md, "Snapshot vs poll".
 */

export interface PollOptions {
    timeout?: number;
    interval?: number;
}

export interface WaitForValueOptions extends PollOptions {
    /** Named in the timeout message. */
    description?: string;
}

/**
 * Polls `produce()` until it returns something **truthy**. Exceptions count as "not yet".
 *
 * Truthiness, not definedness: a produce() that legitimately yields `0`, `''` or `false`
 * will never be seen as having arrived. Wrap such a value (`{ value }`) or use
 * `waitForCondition`.
 */
export async function waitForValue<T>(
    produce: () => Promise<T>,
    { timeout = ELEMENT_TIMEOUT, interval = POLL_INTERVAL, description }: WaitForValueOptions = {},
): Promise<T | null> {
    let captured: T | null = null;

    await browser.waitUntil(async () => {
        captured = await produce().catch(() => null);
        return Boolean(captured);
    }, { timeout, interval }).catch(() => {});

    if (!captured && description) {
        console.log(`  [wait] ${description} did not appear within ${timeout} ms`);
    }

    return captured;
}

/**
 * Polls until `predicate()` is true, then throws `message` on timeout so the failure names
 * the thing that never happened.
 */
export async function waitForCondition(
    predicate: () => Promise<boolean>,
    message: string,
    { timeout = ELEMENT_TIMEOUT, interval = POLL_INTERVAL }: PollOptions = {},
): Promise<void> {
    await browser.waitUntil(
        () => predicate().catch(() => false),
        { timeout, interval, timeoutMsg: message },
    );
}

/**
 * Races named outcomes and reports the first one that happens — the happy path, an error
 * dialog, a permission prompt. Checking them in sequence would spend the first one's whole
 * timeout before looking at the second.
 *
 * @returns the winning name, or null on timeout
 */
export async function race<T extends Record<string, () => Promise<boolean>>>(
    outcomes: T,
    { timeout = ELEMENT_TIMEOUT, interval = POLL_INTERVAL }: PollOptions = {},
): Promise<(keyof T & string) | null> {
    const names = Object.keys(outcomes) as (keyof T & string)[];
    let winner: (keyof T & string) | null = null;

    await browser.waitUntil(async () => {
        // Sequential, not Promise.all: a WebDriver session handles one command at a time,
        // and ordering makes a same-tick tie resolve to the first listed outcome.
        for (const name of names) {
            if (await outcomes[name]().catch(() => false)) {
                winner = name;
                return true;
            }
        }
        return false;
    }, { timeout, interval }).catch(() => {});

    console.log(`  [race] ${winner ? `${winner} won` : `none of [${names.join(', ')}] within ${timeout} ms`}`);
    return winner;
}

/**
 * Runs one command with WDIO's connection retries off.
 *
 * Some commands answer a legitimate question with a WebDriver error — `getAlertText()` with
 * no alert on screen — and WDIO retries those like a transport fault, ~5.7 s per probe on a
 * cloud hub. Not safe to call concurrently: it mutates and restores a shared option.
 */
export async function withoutRetries<T>(fn: () => Promise<T>): Promise<T> {
    const retries = browser.options.connectionRetryCount;
    browser.options.connectionRetryCount = 0;

    try {
        return await fn();
    } finally {
        browser.options.connectionRetryCount = retries;
    }
}

/** `isDisplayed()` that answers false instead of throwing. A snapshot: it does not retry. */
export const isVisible = (element: ChainablePromiseElement): Promise<boolean> =>
    element.isDisplayed().catch(() => false);
