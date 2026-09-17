import fs from 'node:fs';
import { $ } from '@wdio/globals';
import { currentAlertText, fillAppleSignInAlert, APPLE_SIGN_IN_PATTERN } from './alerts.js';
import { waitForValue, withoutRetries } from './polling.js';
import { redactAccount, redactSecrets } from './logMasking.js';
import { tapByPercentage } from './gestures.js';
import { SYSTEM_UI_PROBE_TIMEOUT } from './constants.js';

/**
 * Drives a real StoreKit **sandbox** in-app purchase on iOS. App-agnostic: it starts once
 * the app has presented Apple's payment sheet and ends when the confirmation is gone.
 *
 * The sheet is SpringBoard system UI, invisible to XCUITest on a real device (absent from
 * the element tree, and `getAlertText()` returns null), so the coordinate taps below are the
 * only path that fires. Each helper tries an element selector first, which works on some
 * simulators and cloud pools. A blind miss is silent: nothing throws and the purchase never
 * happens — set `APPLEPAY_DEBUG=true` to capture screenshots around each tap.
 *
 * **Coordinates are per screen size**: measured on 375x812, dead space on 402x874.
 */

const APPLE_PAY_SUBSCRIBE_SELECTOR =
    '-ios predicate string:(label == "Subscribe" OR label == "Buy" OR label == "Confirm with Side Button") AND type == "XCUIElementTypeButton"';
const APPLE_PAY_PASSWORD_SELECTOR =
    '-ios predicate string:type == "XCUIElementTypeSecureTextField"';
// Same field, rooted at the alert: `getAlertText()` does return this prompt's text, so the
// alert is visible even when the sheet behind it is not. Scoping also stops a match on a
// secure field belonging to the app behind the prompt.
const APPLE_PAY_ALERT_PASSWORD_SELECTOR =
    '-ios class chain:**/XCUIElementTypeAlert/**/XCUIElementTypeSecureTextField';
const APPLE_PAY_SIGN_IN_SELECTOR =
    '-ios predicate string:label == "Sign In" AND type == "XCUIElementTypeButton"';
const APPLE_PAY_OK_SELECTOR =
    '-ios predicate string:label == "OK" AND type == "XCUIElementTypeButton"';
// The sandbox card's own submit control, tried before the coordinate fallback.
const APPLE_PAY_CONFIRM_SELECTOR =
    '-ios predicate string:label == "Confirm" AND type == "XCUIElementTypeButton"';
// Some cloud pools render the card as an introspectable two-field form (account + password,
// submitted with "Confirm") instead of the single invisible password field seen locally. A
// plain text field is unique to that variant, so its presence is what distinguishes them.
const APPLE_PAY_ACCOUNT_FIELD_SELECTOR =
    '-ios predicate string:type == "XCUIElementTypeTextField"';
// The post-purchase confirmation. Matched on fragments with no apostrophe — the title
// renders "You're all set." with a typographic U+2019, which a plain "You're" misses.
const PURCHASE_CONFIRMATION_SELECTOR =
    '-ios predicate string:label CONTAINS[c] "purchase was successful" '
    + 'OR name CONTAINS[c] "purchase was successful" '
    + 'OR label CONTAINS[c] "all set" OR name CONTAINS[c] "all set"';
const PURCHASE_CONFIRMATION_OK_SELECTOR =
    '-ios predicate string:(name == "OK" OR label == "OK") AND type == "XCUIElementTypeButton"';
// StoreKit swaps the credential prompt for a plain error alert when a submit went in wrong.
// It has no field to fill, so carrying on into the blind taps walks the run into Apple's
// account-management screens. Narrow on purpose: an unrecognised alert still falls through.
const APPLE_PAY_ERROR_PATTERN =
    /must enter both|incorrect|could not sign in|unable to|not available/i;

// --- Measured coordinates (fractions of screen width/height) ---------------
// Fallbacks for controls XCUITest cannot resolve. Measured, not guessed, and per screen size.
const SUBSCRIBE_XY_PCT = { x: 0.497, y: 0.923 };
const SANDBOX_PASSWORD_Y_PCT = 0.452;
const SANDBOX_CONFIRM_Y_PCT = 0.577;
const CONFIRMATION_OK_XY_PCT = { x: 0.498, y: 0.554 };
const SHEET_CENTRE_X_PCT = 0.498;

// Subscribe is probed while the sheet is still animating up, so unlike the post-settle
// probes it has to out-wait an appearing element.
const APPLE_PAY_SHEET_ANIMATE_TIMEOUT = 4000;

// The card is undetectable, so there is nothing to wait *on* — only a duration.
const SANDBOX_CARD_RENDER_WAIT = 8000;

// Same, after Confirm. Longer because Apple has to settle the transaction: a StoreKit round
// trip, not an animation.
const SANDBOX_CONFIRMATION_WAIT = 10000;

const APPLEPAY_DEBUG = process.env.APPLEPAY_DEBUG === 'true';

/** A fully configured account/password pair to try at the sign-in prompt. */
interface SignInCandidate {
    label: string;
    appleId: string;
    password: string;
}

/** A post-purchase modal: a real UIAlertController, or an in-app look-alike. */
export interface PurchaseConfirmation {
    kind: 'alert' | 'dialog';
    text: string;
}

/**
 * Finds an element by selector and taps it.
 * @returns {Promise<boolean>} true if the element was found and tapped
 */
async function tryTapElement(selector: string, timeout = 3000): Promise<boolean> {
    try {
        const el = $(selector);
        await el.waitForDisplayed({ timeout });
        // Logged so the coordinate fallbacks can be re-measured from a real run.
        const rect = await Promise.all([el.getLocation(), el.getSize()])
            .then(([loc, size]) => `x=${loc.x} y=${loc.y} ${size.width}x${size.height}`)
            .catch(() => 'rect unavailable');
        await el.click();
        console.log(`  [ApplePay] Tapped element: ${selector} (${rect})`);
        return true;
    } catch {
        console.log(`  [ApplePay] Element not found (${selector}), using coordinate fallback`);
        return false;
    }
}

/** Taps the confirm button on the Apple Pay sheet ("Subscribe" / "Buy"). */
export async function tapApplePaySubscribe(): Promise<void> {
    const found = await tryTapElement(APPLE_PAY_SUBSCRIBE_SELECTOR, APPLE_PAY_SHEET_ANIMATE_TIMEOUT);
    if (!found) await tapByPercentage(SUBSCRIBE_XY_PCT.x, SUBSCRIBE_XY_PCT.y);
}

/** Taps the password field on the sandbox authorisation card. */
export async function tapApplePayPasswordField(): Promise<void> {
    const found =
        await tryTapElement(APPLE_PAY_ALERT_PASSWORD_SELECTOR, SYSTEM_UI_PROBE_TIMEOUT) ||
        await tryTapElement(APPLE_PAY_PASSWORD_SELECTOR, SYSTEM_UI_PROBE_TIMEOUT);
    if (!found) await tapByPercentage(SHEET_CENTRE_X_PCT, SANDBOX_PASSWORD_Y_PCT);
}

/** Taps the "Confirm" / "Sign In" / "OK" button after entering the sandbox password. */
export async function tapApplePayConfirm(): Promise<void> {
    const found =
        await tryTapElement(APPLE_PAY_CONFIRM_SELECTOR, SYSTEM_UI_PROBE_TIMEOUT) ||
        await tryTapElement(APPLE_PAY_SIGN_IN_SELECTOR, SYSTEM_UI_PROBE_TIMEOUT) ||
        await tryTapElement(APPLE_PAY_OK_SELECTOR, SYSTEM_UI_PROBE_TIMEOUT);
    if (!found) await tapByPercentage(SHEET_CENTRE_X_PCT, SANDBOX_CONFIRM_Y_PCT);
}

/** Screenshots the sheet. No-op unless APPLEPAY_DEBUG is set — captures cost ~22 s. */
async function captureSandboxSheet(label: string): Promise<void> {
    if (!APPLEPAY_DEBUG) return;

    try {
        if (!fs.existsSync('./test-results')) fs.mkdirSync('./test-results', { recursive: true });
        const file = `./test-results/applepay-${label}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
        await browser.saveScreenshot(file);
        console.log(`  [ApplePay] captured ${file}`);
    } catch (error) {
        console.log(`  [ApplePay] could not capture "${label}": ${(error as Error).message}`);
    }
}

/** Records what can be read about the credential prompt before the blind taps run. */
async function logSandboxSheetDiagnostics(): Promise<void> {
    if (!APPLEPAY_DEBUG) return;

    const activeApp = await browser.execute('mobile: activeAppInfo')
        .catch((e: Error) => `unavailable (${e.message})`);
    console.log(`  [ApplePay] active app: ${JSON.stringify(activeApp)}`);

    const secureVisible = await $(APPLE_PAY_PASSWORD_SELECTOR).isDisplayed().catch(() => false);
    console.log(`  [ApplePay] unscoped secure field visible: ${secureVisible}`);

    const source = await browser.getPageSource().catch(() => '');
    console.log(`  [ApplePay] page source ${source.length} chars`
        + ` | mentions "Sandbox": ${source.includes('Sandbox')}`
        + ` | mentions "Confirm": ${source.includes('Confirm')}`);

    await captureSandboxSheet('before-typing');
}

/**
 * Tries the configured account/password pairs until the sign-in prompt goes away. A real
 * device's sandbox account and a simulator's ordinary Apple Account are different logins,
 * and which applies is not knowable from here.
 */
async function signInWithFirstWorkingAccount(
    preferredAppleId: string | undefined,
    preferredPassword: string | undefined,
): Promise<void> {
    const candidates = [
        { label: 'sandbox account', appleId: preferredAppleId, password: preferredPassword },
        {
            label: 'simulator Apple Account',
            appleId: process.env.IOS_SIM_APPLE_ID,
            password: process.env.IOS_SIM_APPLE_PASSWORD,
        },
    ].filter((candidate, index, all): candidate is SignInCandidate =>
        Boolean(candidate.appleId && candidate.password)
        // Skip a duplicate when both variables point at the same login.
        && all.findIndex((other) => other.appleId === candidate.appleId) === index);

    if (candidates.length === 0) {
        throw new Error(
            'The purchase is asking for an Apple Account and a password, but no complete pair '
            + 'is configured. Set IOS_SANDBOX_ACCOUNT + IOS_SANDBOX_APPLE_PAY_PASSWORD, or '
            + 'IOS_SIM_APPLE_ID + IOS_SIM_APPLE_PASSWORD, in .env.'
        );
    }

    for (const { label, appleId, password } of candidates) {
        // Redacted by hand: `maskingPatterns` covers @wdio/logger output, not console.log.
        console.log(`  [ApplePay] trying the ${label}: ${redactAccount(appleId)}`);
        await fillAppleSignInAlert(appleId, password);
        await browser.pause(5000);

        const stillAsking = await currentAlertText();
        if (!stillAsking || !APPLE_SIGN_IN_PATTERN.test(stillAsking)) {
            console.log(`  [ApplePay] ${label} accepted`);
            return;
        }

        console.log(`  [ApplePay] ${label} was rejected — prompt is still up`);
    }

    // Redacted: this message reaches Allure's statusDetails, the CI job summary and the
    // published report — a wider audience than any log file.
    throw new Error(
        `The purchase sign-in prompt rejected every configured account (${candidates
            .map((c) => redactAccount(c.appleId))
            .join(', ')}). Check the credentials, and note a two-factor account cannot be `
        + 'automated from here.'
    );
}

/**
 * Supplies the sandbox credentials the purchase asks for. StoreKit asks in one of two
 * shapes — a full sign-in alert, or a password-only card — so this detects which.
 *
 * `appleId` (`IOS_SANDBOX_ACCOUNT`) is needed only for the two-field variant.
 */
export async function enterApplePaySandboxPasswordAndConfirm(
    password: string,
    appleId?: string,
): Promise<void> {
    const alertText = await currentAlertText();

    if (alertText) {
        console.log(`  [ApplePay] alert on screen: ${JSON.stringify(redactSecrets(alertText).slice(0, 80))}`);

        // The two-field "Sign in to Apple Account" variant is a real alert, drivable by element.
        if (APPLE_SIGN_IN_PATTERN.test(alertText)) {
            await signInWithFirstWorkingAccount(appleId, password);
            return;
        }

        // An error alert has no field to fill; typing on into it is worse than failing.
        if (APPLE_PAY_ERROR_PATTERN.test(alertText)) {
            throw new Error(`Apple rejected the purchase credentials: ${redactSecrets(alertText).slice(0, 160)}`);
        }
    }

    // Otherwise assume the sandbox card. It cannot be detected, so any early return on
    // "nothing is being asked" would also skip the password when the card *is* up.
    await logSandboxSheetDiagnostics();

    await browser.pause(SANDBOX_CARD_RENDER_WAIT);

    // Introspectable on some pools; filling it only when found leaves the invisible
    // single-field variant untouched.
    if (appleId) {
        const accountField = $(APPLE_PAY_ACCOUNT_FIELD_SELECTOR);
        const hasAccountField = await accountField
            .waitForDisplayed({ timeout: SYSTEM_UI_PROBE_TIMEOUT })
            .then(() => true)
            .catch(() => false);
        if (hasAccountField) {
            console.log('  [ApplePay] two-field sandbox card detected — filling the account field first');
            await accountField.click();
            await browser.keys(appleId.split(''));
        }
    }

    await tapApplePayPasswordField();
    await browser.keys(password.split(''));

    // A filled field and an enabled Confirm prove the blind taps hit; the capture above is
    // always an empty card.
    await captureSandboxSheet('after-typing');

    await tapApplePayConfirm();

    // Separates "Confirm was never pressed" from "pressed and Apple rejected it".
    await captureSandboxSheet('after-confirm');
}

/**
 * Reports what post-purchase modal is on screen. Checks both shapes because which appears is
 * not established: `getAlertText()` sees a real UIAlertController, the selector an in-app
 * look-alike. Either way it is modal.
 *
 * @returns {Promise<{kind: 'alert'|'dialog', text: string}|null>}
 */
async function purchaseConfirmationOnScreen(): Promise<PurchaseConfirmation | null> {
    const text = await currentAlertText();
    if (text) return { kind: 'alert', text };

    const dialog = $(PURCHASE_CONFIRMATION_SELECTOR);
    if (await dialog.isDisplayed().catch(() => false)) {
        const label = await dialog.getAttribute('label').catch(() => null);
        return { kind: 'dialog', text: label ?? '(unreadable)' };
    }

    return null;
}

/**
 * Dismisses the "You're all set. / Your purchase was successful." confirmation.
 *
 * Runs regardless of `autoAcceptAlerts` — "the runner probably handled it" is not evidence,
 * and one run left the dialog modal over the next screen for 237 s. But it acts only on
 * positive evidence: an earlier version fired its coordinate fallback unconditionally and
 * tapped the middle of whatever had replaced the sheet.
 *
 * @returns {Promise<boolean>} true when nothing was up or it was dismissed; false when it is
 *   still on screen after every path.
 */
export async function dismissSandboxPurchaseConfirmation(): Promise<boolean> {
    const found = await waitForValue(purchaseConfirmationOnScreen, {
        timeout: SANDBOX_CONFIRMATION_WAIT,
        interval: 1000,
    });

    if (!found) {
        // NOT evidence that nothing was there — the dialog is invisible to both
        // getAlertText() and predicate searches on a real device, where `autoAcceptAlerts`
        // reaches it through XCUITest's own alert handling that our queries cannot see.
        console.log(`  [ApplePay] no purchase confirmation within ${SANDBOX_CONFIRMATION_WAIT} ms — nothing to dismiss`);
        return true;
    }

    // A sign-in prompt here is not a confirmation — the credentials never went through, and
    // the alert path below would accept it with an empty form and re-raise it.
    if (APPLE_SIGN_IN_PATTERN.test(found.text)) {
        throw new Error(
            'The purchase is still asking for an Apple Account after Confirm, so the sandbox '
            + `credentials never went through: ${redactSecrets(found.text).slice(0, 160)}`
        );
    }

    // The other non-confirmation answer to Confirm. Without this a rejection was cleared as
    // though it were "You're all set", and a purchase that never registered passed.
    if (APPLE_PAY_ERROR_PATTERN.test(found.text)) {
        throw new Error(`Apple rejected the purchase after Confirm: ${redactSecrets(found.text).slice(0, 160)}`);
    }

    console.log(`  [ApplePay] purchase confirmation on screen (${found.kind}): ${JSON.stringify(redactSecrets(found.text).slice(0, 80))}`);

    const paths: [string, () => Promise<void>][] = [
        ['acceptAlert()', () => withoutRetries(() => browser.acceptAlert())],
        ['the OK button', async () => {
            const ok = $(PURCHASE_CONFIRMATION_OK_SELECTOR);
            await ok.waitForDisplayed({ timeout: SYSTEM_UI_PROBE_TIMEOUT });
            await ok.click();
        }],
        // Last resort: height-dependent, since a longer message sits differently.
        ['the measured OK coordinate', () => tapByPercentage(CONFIRMATION_OK_XY_PCT.x, CONFIRMATION_OK_XY_PCT.y)],
    ];

    for (const [label, dismiss] of paths) {
        await dismiss().catch(() => {});
        await browser.pause(1000);

        if (!(await purchaseConfirmationOnScreen())) {
            console.log(`  [ApplePay] confirmation dismissed via ${label}`);
            return true;
        }

        console.log(`  [ApplePay] ${label} did not dismiss it — trying the next path`);
    }

    console.warn(
        '  [ApplePay] the purchase confirmation is STILL on screen after every dismissal path. '
        + 'It is modal, so nothing behind it is tappable until it goes.'
    );
    return false;
}

/**
 * Completes a sandbox purchase, from the payment sheet to a cleared confirmation. Call it
 * once your page object has tapped the paywall's CTA. A falsy `password` skips the
 * credential step, for a simulator where StoreKit does not ask.
 *
 * **Reaching the end is not proof the purchase registered** — only that the blind taps did
 * not throw. One run completed normally while the account's subscription list was
 * byte-identical before and after. Assert against app state or a receipt instead.
 */
export async function completePurchase(
    password: string | undefined,
    appleId = process.env.IOS_SANDBOX_ACCOUNT,
): Promise<void> {
    await tapApplePaySubscribe();

    if (password) {
        await enterApplePaySandboxPasswordAndConfirm(password, appleId);
    }

    // The `false` return is ignored on purpose: a stuck confirmation is not by itself a
    // failed purchase, and the caller's next step is better placed to fail on one. It does
    // still *throw* on a rejection or a re-raised sign-in prompt.
    await dismissSandboxPurchaseConfirmation();
}

/**
 * Cancels the purchase at the sign-in prompt, for runners that cannot complete a real one
 * (simulator, some cloud pools). Tolerant: a prompt that never shows is logged, not failed.
 *
 * Needs `IOS_AUTO_ACCEPT_ALERTS=false` — with auto-accept on, XCUITest can accept the same
 * alert with blank credentials first.
 */
export async function cancelApplePaySignIn(): Promise<void> {
    await tapApplePaySubscribe();

    if (process.env.IOS_AUTO_ACCEPT_ALERTS !== 'false') {
        console.warn('  [ApplePay] IOS_AUTO_ACCEPT_ALERTS is on — the sign-in prompt may already be auto-accepted before this can cancel it.');
    }

    const appeared = await browser.waitUntil(async () => {
        const text = await currentAlertText();
        return Boolean(text && APPLE_SIGN_IN_PATTERN.test(text));
    }, {
        timeout: 15000,
        interval: 1000,
    }).then(() => true).catch(() => false);

    if (!appeared) {
        console.log('  [ApplePay] no Apple sign-in prompt appeared after the CTA — nothing to cancel');
        return;
    }

    console.log('  [ApplePay] cancelling the Apple sign-in prompt');
    await withoutRetries(() => browser.dismissAlert()).catch(() => {});
}
