# test/helpers/

Cross-cutting mechanics, shared by every page object and spec. **App-agnostic**: nothing here
may know a screen, a selector or a flow of the app under test — that belongs in a page object.

Reuse before writing. Every one of these has been re-implemented by somebody who didn't look:
waiting and racing two outcomes (`polling.ts`), taps and swipes (`gestures.ts`), iOS system
alerts (`alerts.ts`), selector builders (`locators.ts`), timeouts (`constants.ts`). If an
existing helper is close but not right, extend it rather than adding a fourth way to wait.

The full concern → file mapping is the table in
[`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md); read it before adding a helper, along
with the layering rules and the four guardrails these files encode.

Shared multi-screen step sequences go in `*Steps.ts` here, with a mirroring `_shared.*.md`
case file — not inlined into each spec.

Every helper logs under a bracketed prefix (`[ApplePay]`, `[alert]`, `[race]`) so a 6,000-line
run log stays greppable. Keep that up in anything you add.
