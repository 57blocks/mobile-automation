import type { ChainablePromiseElement } from 'webdriverio';
import { POLL_INTERVAL } from './constants.js';

/**
 * Coordinate-level gestures, for when there is no element to drive — system UI XCUITest
 * cannot see, a webview control with no accessible node. A blind tap has no failure mode: it
 * "succeeds" whether or not anything was under it, so every miss surfaces later as an
 * unrelated symptom.
 */

export interface WindowSize {
    width: number;
    height: number;
}

/** A point given as fractions (0–1) of screen width and height. */
export interface FractionalPoint {
    x: number;
    y: number;
}

// Cached per worker process, which gets one session and one spec file, so the size cannot
// change underneath it. `getWindowSize()` was otherwise paid on every blind tap (2.79 s
// across eight call sites). A spec that rotates mid-run needs a per-orientation lookup.
let cachedWindowSize: WindowSize | undefined;

export async function windowSize(): Promise<WindowSize> {
    cachedWindowSize = cachedWindowSize || await browser.getWindowSize();
    return cachedWindowSize;
}

/** Drops the cached size — call after a deliberate rotation. */
export function resetWindowSizeCache(): void {
    cachedWindowSize = undefined;
}

/**
 * Taps a point at the given fraction (0–1) of screen width/height.
 *
 * Fractions, not pixels — portable between screens of the same aspect ratio, and no further.
 * Re-measure on a new device rather than assuming a miss is an app bug.
 */
export async function tapByPercentage(xPct: number, yPct: number): Promise<void> {
    const { width, height } = await windowSize();
    const x = Math.round(width * xPct);
    const y = Math.round(height * yPct);

    // The tap is blind, so a miss is silent; the resolved point makes a screen capture from
    // the same run measurable afterwards.
    console.log(`  [tap] (${xPct}, ${yPct}) of ${width}x${height} -> (${x}, ${y})`);

    await browser.action('pointer', { parameters: { pointerType: 'touch' } })
        .move({ x, y })
        .down()
        .up()
        .perform();
}

/** Taps an absolute point. Prefer `tapByPercentage` — pixels do not travel between devices. */
export async function tapByCoordinates(x: number, y: number): Promise<void> {
    console.log(`  [tap] absolute (${x}, ${y})`);
    await browser.action('pointer', { parameters: { pointerType: 'touch' } })
        .move({ x, y })
        .down()
        .up()
        .perform();
}

/**
 * Swipes between two `{ x, y }` points given as fractions (0–1). Slower is more reliable on
 * a list that flings.
 */
export async function swipeByPercentage(
    from: FractionalPoint,
    to: FractionalPoint,
    durationMs = 600,
): Promise<void> {
    const { width, height } = await windowSize();
    const start = { x: Math.round(width * from.x), y: Math.round(height * from.y) };
    const end = { x: Math.round(width * to.x), y: Math.round(height * to.y) };

    await browser.action('pointer', { parameters: { pointerType: 'touch' } })
        .move(start)
        .down()
        .pause(100)
        .move({ ...end, duration: durationMs })
        .up()
        .perform();
}

/** Short vertical swipes, biased to the middle of the screen to avoid edge gestures. */
export const swipeUp = (durationMs?: number): Promise<void> =>
    swipeByPercentage({ x: 0.5, y: 0.7 }, { x: 0.5, y: 0.3 }, durationMs);
export const swipeDown = (durationMs?: number): Promise<void> =>
    swipeByPercentage({ x: 0.5, y: 0.3 }, { x: 0.5, y: 0.7 }, durationMs);
export const swipeLeft = (durationMs?: number): Promise<void> =>
    swipeByPercentage({ x: 0.8, y: 0.5 }, { x: 0.2, y: 0.5 }, durationMs);
export const swipeRight = (durationMs?: number): Promise<void> =>
    swipeByPercentage({ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }, durationMs);

export interface ScrollOptions {
    maxSwipes?: number;
    /** `up` reveals content further down the list. */
    direction?: 'up' | 'down';
}

/**
 * Swipes until an element is displayed, or gives up after `maxSwipes`.
 *
 * Bounded on purpose: an unbounded "scroll until found" against a list without the target
 * dies as a mocha timeout, which names nothing useful.
 *
 * @returns whether the element became visible
 */
export async function scrollToElement(
    element: ChainablePromiseElement,
    { maxSwipes = 8, direction = 'up' }: ScrollOptions = {},
): Promise<boolean> {
    const swipe = direction === 'up' ? swipeUp : swipeDown;

    // maxSwipes swipes, and one check after each of them plus one before the first.
    for (let attempt = 0; attempt <= maxSwipes; attempt++) {
        if (await element.isDisplayed().catch(() => false)) return true;
        if (attempt === maxSwipes) break;
        await swipe();
        await browser.pause(POLL_INTERVAL);
    }

    return false;
}
