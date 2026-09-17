import 'dotenv/config';
import { PREFLIGHT_CHECKS, isCheckEnabled } from '../helpers/preflight.js';
import '../checks.js';

/**
 * Runs the pre-flight checks that need a WebDriver session. `scripts/preflight.ts` shells
 * out to this; `npm run preflight -- <name>` is the intended way in.
 *
 * Framework infrastructure, not a test — it asserts nothing about the product. It lives
 * outside `test/<platform>/specs/` so the configs' spec globs never pick it up. It is
 * deliberately **not** in any config's `exclude`: in wdio, `exclude` beats `--spec`, so an
 * excluded file cannot be run explicitly at all.
 *
 * Checks default to enabled here: running this spec at all is the opt-in. `--check` narrows
 * the set, which is how the script targets one of them.
 */
describe('iOS pre-flight checks', () => {

    for (const [name, check] of Object.entries(PREFLIGHT_CHECKS)) {
        // The rest run in-process in scripts/preflight.ts; spending an Appium session on a
        // plain HTTP call would defeat the fast path.
        if (!check.needsDriver) continue;

        const maybeIt = isCheckEnabled(name, true) ? it : it.skip;

        maybeIt(`${name} — ${check.summary}`, async function () {
            this.timeout(check.timeout);
            await check.run();
        });
    }
});
