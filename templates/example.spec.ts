import { expect } from '@wdio/globals';
import LoginPage, { HomePage } from './example.page.js';
import { race, isVisible } from '../test/helpers/polling.js';
import { requireEnv } from '../config/app.config.js';

/**
 * TEMPLATE — copy into `test/<platform>/specs/<name>.spec.ts` and adapt.
 * Not wired into any suite.
 *
 * **Fix the imports first.** They are written for this file's location; from
 * `test/ios/specs/` they become `../pageobjects/<feature>/<screen>.page.ts`,
 * `../../helpers/polling.js` and `../../../config/app.config.js`.
 *
 * The spec is 1:1 with `testcases/<platform>/<name>.md`: same name, and each `it()` title is
 * the exact string that file's `**Automated:**` line quotes.
 */
describe('Example — log in with valid credentials', () => {

    // Setup that must happen before the first `it()`. Anything that can fail for an
    // environmental reason belongs in a pre-flight check instead (see test/checks.ts).
    before(async () => {
        // Fail on a missing credential here rather than typing `undefined` into the field.
        requireEnv(['TEST_USERNAME', 'TEST_PASSWORD']);
        // e.g. await restartAppWithFlags({ ...BASE_FLAGS, ...PRESETS.loginV2 });
    });

    it('should display the Log In screen on app launch', async () => {
        await LoginPage.isDisplayed();
        await expect(LoginPage.btnSubmit).toBeDisplayed();
    });

    it('should sign in and land on the home screen', async () => {
        // Non-null: requireEnv() in before() has already failed the run if either is unset.
        await LoginPage.logIn(process.env.TEST_USERNAME!, process.env.TEST_PASSWORD!);

        // Two outcomes are possible, so race them: asserting on the happy path alone would
        // spend its whole timeout before noticing the error, then report "the home screen
        // never appeared" for a rejected credential. Both predicates are one-shot — `race`
        // does the polling.
        const outcome = await race({
            signedIn: () => HomePage.isCurrentlyDisplayed(),
            error: () => isVisible(LoginPage.txtError),
        }, { timeout: 20000 });

        expect(outcome).toBe('signedIn');
    });

    // What NOT to do:
    //   - No step that logs `[skip]` and passes when its precondition is missing. A green
    //     run that skipped its only assertion reports coverage that does not exist.
    //   - No negative asserted from an empty query. `(await $$('...')).length === 0` means
    //     "no rows matched", not "the list is empty" — a modal gives the same zero.
    //   - No retry of a step with a one-way side effect (a purchase, a deletion).
});
