import type { ChainablePromiseElement } from 'webdriverio';
import { SCREEN_TIMEOUT, ELEMENT_TIMEOUT } from './constants.js';
import { scrollToElement, type ScrollOptions } from './gestures.js';
import { isVisible } from './polling.js';

/**
 * Base class for page objects: one screen each, elements as getters, actions as methods,
 * exported as a singleton. Extend this and define `rootElement` to get wait-then-act free.
 *
 * No assertions and no cross-screen flows — see docs/ARCHITECTURE.md. Start from
 * `templates/example.page.ts`.
 */
export default class BasePage {

    /**
     * The element that proves this screen is up. Override it. Pick a stable anchor — a
     * primary CTA's identifier usually outlives a title's copy.
     */
    get rootElement(): ChainablePromiseElement {
        throw new Error(`${this.constructor.name} must define a rootElement getter.`);
    }

    /** Waits for the screen. Throws with wdio's own message, which names the selector. */
    async isDisplayed(timeout = SCREEN_TIMEOUT): Promise<boolean> {
        await this.rootElement.waitForDisplayed({ timeout });
        return true;
    }

    /** Whether the screen is up right now. A snapshot — it does not wait. */
    async isCurrentlyDisplayed(): Promise<boolean> {
        return isVisible(this.rootElement);
    }

    /** Waits for an element, then taps it. */
    async tap(element: ChainablePromiseElement, timeout = ELEMENT_TIMEOUT): Promise<void> {
        await element.waitForDisplayed({ timeout });
        await element.click();
    }

    /**
     * Taps an element only if it is already on screen, for genuinely optional UI. Use it
     * sparingly: a spec that tolerates a screen it should assert on passes either way.
     *
     * @returns whether the tap happened
     */
    async tapIfPresent(element: ChainablePromiseElement): Promise<boolean> {
        if (!(await isVisible(element))) return false;
        await element.click();
        return true;
    }

    /** Waits for a field, clears it, and types into it. */
    async type(element: ChainablePromiseElement, value: string, timeout = ELEMENT_TIMEOUT): Promise<void> {
        await element.waitForDisplayed({ timeout });
        await element.click();
        await element.clearValue().catch(() => {});
        await element.setValue(value);
    }

    /**
     * Types without clearing — for OTP boxes and masked fields where `clearValue()` either
     * throws or silently moves focus.
     */
    async typeKeys(element: ChainablePromiseElement, value: string | number, timeout = ELEMENT_TIMEOUT): Promise<void> {
        await element.waitForDisplayed({ timeout });
        await element.click();
        await browser.keys(String(value).split(''));
    }

    /** Waits for an element and returns its visible text. */
    async textOf(element: ChainablePromiseElement, timeout = ELEMENT_TIMEOUT): Promise<string> {
        await element.waitForDisplayed({ timeout });
        return element.getText();
    }

    /** Scrolls until an element is visible, then taps it. */
    async scrollAndTap(element: ChainablePromiseElement, options?: ScrollOptions): Promise<void> {
        const found = await scrollToElement(element, options);
        if (!found) {
            throw new Error(`${this.constructor.name}: could not bring the element into view after scrolling.`);
        }
        await element.click();
    }

    /** Hides the keyboard, tolerating a platform that has already hidden it. */
    async hideKeyboard(): Promise<void> {
        await browser.hideKeyboard().catch(() => {});
    }
}
