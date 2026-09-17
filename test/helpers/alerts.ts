import { withoutRetries } from './polling.js';
import { redactSecrets } from './logMasking.js';

/**
 * Explicit iOS system-alert handling, for runs where `appium:autoAcceptAlerts` is off.
 *
 * `autoAcceptAlerts` accepts *every* alert, which is wrong in two known cases: a prompt
 * whose "OK" is destructive to the flow, and the simulator's "Sign in to Apple Account"
 * prompt, which it accepts with an empty form and so wedges the launch.
 *
 * Every helper no-ops when no alert is showing. When auto-accept is on they return `null` /
 * `'not-checked'` rather than `false` — nothing here ever looked.
 */

/** The StoreKit sign-in prompt. Loose: the wording has changed across iOS versions. */
export const APPLE_SIGN_IN_PATTERN = /sign ?in to (apple|itunes)/i;

/** `not-checked` means auto-accept is on and nothing here ever looked. */
export type AppleSignInOutcome = 'not-checked' | 'none' | 'cancelled';

// On the default, `autoAcceptAlerts` dismisses everything before a test gets a turn, so a
// probe here would only pay webdriver's retry cost for a certain miss.
const ALERTS_AUTO_ACCEPTED = process.env.IOS_AUTO_ACCEPT_ALERTS !== 'false';

// Rooted at XCUIElementTypeAlert on purpose — an unscoped TextField match can pick up a
// field from the app sitting behind the alert.
const ALERT = '**/XCUIElementTypeAlert';
const ALERT_ACCOUNT_FIELD = `-ios class chain:${ALERT}/**/XCUIElementTypeTextField`;
const ALERT_PASSWORD_FIELD = `-ios class chain:${ALERT}/**/XCUIElementTypeSecureTextField`;
// Separate selectors rather than one OR predicate — class chains don't reliably support it.
const ALERT_CONFIRM_BUTTONS = [
    `-ios class chain:${ALERT}/**/XCUIElementTypeButton[\`label == "OK"\`]`,
    `-ios class chain:${ALERT}/**/XCUIElementTypeButton[\`label == "Sign In"\`]`,
];

/** @returns {Promise<string|null>} the visible alert's text, or null when none is showing. */
export async function currentAlertText(): Promise<string | null> {
    return withoutRetries(() => browser.getAlertText()).catch(() => null);
}

/**
 * Cancels the "Sign in to Apple Account" prompt, retrying because a device without a
 * signed-in account can re-raise it while the app settles. Leaves other alerts alone.
 */
export async function cancelAppleSignInIfPresent(attempts = 3): Promise<boolean> {
    let cancelled = false;

    for (let attempt = 0; attempt < attempts; attempt++) {
        const text = await currentAlertText();
        if (!text || !APPLE_SIGN_IN_PATTERN.test(text)) break;

        console.log(`  [alert] cancelling Apple sign-in prompt: ${JSON.stringify(redactSecrets(text).slice(0, 60))}`);
        await withoutRetries(() => browser.dismissAlert()).catch(() => {});
        cancelled = true;
        await browser.pause(1000);
    }

    return cancelled;
}

/**
 * Types credentials into the sign-in alert on screen and confirms it. Throws when the alert
 * lacks a field or button, rather than typing an Apple ID into whatever happened to match.
 */
export async function fillAppleSignInAlert(appleId: string, password: string): Promise<void> {
    const account = await $(ALERT_ACCOUNT_FIELD);
    const secure = await $(ALERT_PASSWORD_FIELD);

    await account.waitForDisplayed({ timeout: 5000 });
    await secure.waitForDisplayed({ timeout: 5000 });

    await account.click();
    await account.setValue(appleId);

    await secure.click();
    await secure.setValue(password);

    for (const selector of ALERT_CONFIRM_BUTTONS) {
        const button = await $(selector);
        if (!(await button.isDisplayed().catch(() => false))) continue;
        await button.click();
        return;
    }

    throw new Error('no OK / Sign In button inside the alert');
}

/**
 * Cancels the Apple sign-in prompt if showing. Never signs in — accepting with empty
 * credentials is what wedges the launch.
 *
 * @returns {Promise<'not-checked'|'none'|'cancelled'>} `not-checked` when auto-accept is on.
 */
export async function handleAppleSignInIfPresent(): Promise<AppleSignInOutcome> {
    if (ALERTS_AUTO_ACCEPTED) return 'not-checked';

    const text = await currentAlertText();
    if (!text || !APPLE_SIGN_IN_PATTERN.test(text)) return 'none';

    console.log(`  [alert] Apple sign-in prompt on screen — cancelling: ${JSON.stringify(redactSecrets(text).slice(0, 60))}`);
    await cancelAppleSignInIfPresent();
    return 'cancelled';
}

/**
 * Accepts whatever alert is showing (ATT, notifications, contacts) — except the Apple
 * sign-in prompt, which gets cancelled instead of accepted with empty credentials.
 *
 * @returns {Promise<boolean|null>} true when an alert was handled, false when none was
 *   showing, null when auto-accept is on and nothing was checked.
 */
export async function acceptAlertIfPresent(): Promise<boolean | null> {
    if (ALERTS_AUTO_ACCEPTED) return null;

    const text = await currentAlertText();
    if (!text) return false;

    if (APPLE_SIGN_IN_PATTERN.test(text)) {
        // Never accept this one on an empty form — sign in properly or cancel.
        return (await handleAppleSignInIfPresent()) === 'cancelled';
    }

    console.log(`  [alert] accepting: ${JSON.stringify(redactSecrets(text).slice(0, 60))}`);
    await withoutRetries(() => browser.acceptAlert()).catch(() => {});
    return true;
}

/**
 * Dismisses whatever alert is showing.
 *
 * @returns {Promise<boolean|null>} true when an alert was handled, false when none was
 *   showing, null when auto-accept is on and nothing was checked.
 */
export async function dismissAlertIfPresent(): Promise<boolean | null> {
    if (ALERTS_AUTO_ACCEPTED) return null;

    const text = await currentAlertText();
    if (!text) return false;

    console.log(`  [alert] dismissing: ${JSON.stringify(redactSecrets(text).slice(0, 60))}`);
    await withoutRetries(() => browser.dismissAlert()).catch(() => {});
    return true;
}
