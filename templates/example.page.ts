import { $ } from '@wdio/globals';
import type { ChainablePromiseElement } from 'webdriverio';
import BasePage from '../test/helpers/basePage.js';
import { iosNameOrLabel, iosButton } from '../test/helpers/locators.js';
import { ELEMENT_TIMEOUT } from '../test/helpers/constants.js';

/**
 * TEMPLATE — copy into `test/ios/pageobjects/<feature>/<screen>.page.ts` and adapt.
 * Not wired into any suite.
 *
 * One class per screen. Elements as getters, actions as methods, exported as a singleton.
 */
class ExampleLoginPage extends BasePage {

    // --- Elements ---------------------------------------------------------
    // Getters, not fields: a field would resolve once at import time, before a session
    // exists.

    /** The anchor that proves this screen is up — the CTA, not the title, which copy-changes. */
    get rootElement(): ChainablePromiseElement {
        return this.btnSubmit;
    }

    get inputEmail(): ChainablePromiseElement {
        return $('~emailField');
    }

    get inputPassword(): ChainablePromiseElement {
        return $('~passwordField');
    }

    /** Matched on both identifier and visible label — see `iosNameOrLabel` for why. */
    get btnSubmit(): ChainablePromiseElement {
        return $(iosNameOrLabel('submitButton', 'Log In'));
    }

    get btnForgotPassword(): ChainablePromiseElement {
        return $(iosButton('Forgot password?'));
    }

    /** The inline error the screen shows on bad credentials. */
    get txtError(): ChainablePromiseElement {
        return $('~loginErrorMessage');
    }

    // --- Actions ----------------------------------------------------------
    // No assertions here. A page object reports what is on screen; the spec decides whether
    // that is correct.

    async logIn(email: string, password: string): Promise<void> {
        await this.type(this.inputEmail, email);
        await this.type(this.inputPassword, password);
        await this.hideKeyboard();
        await this.tap(this.btnSubmit);
    }

    /**
     * Waits for the inline error and reports whether it appeared — it is called right after
     * a submit. For a one-shot check inside a `race`, use `isVisible(LoginPage.txtError)`.
     */
    async hasError(timeout = ELEMENT_TIMEOUT): Promise<boolean> {
        return this.txtError
            .waitForDisplayed({ timeout })
            .then(() => true)
            .catch(() => false);
    }
}

/** Where a successful login lands. Here only so the spec template has something to race. */
class ExampleHomePage extends BasePage {
    get rootElement(): ChainablePromiseElement {
        return $(iosNameOrLabel('homeTab', 'Home'));
    }
}

// Singletons, not the classes: specs read better as `LoginPage.logIn(...)`.
export const HomePage = new ExampleHomePage();
export default new ExampleLoginPage();
