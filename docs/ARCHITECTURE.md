# Architecture

## Layers

```
  spec                 what should happen        test/<platform>/specs/*.spec.ts
    │                  Mocha it() blocks, assertions. No selectors.
    ▼
  shared steps         sequences reused by several specs   test/helpers/*Steps.ts
    │                  Register it() blocks; mirrored by testcases/_shared.*.md
    ▼
  page object          how one screen works      test/<platform>/pageobjects/**/*.page.ts
    │                  Elements as getters, actions as methods. No assertions.
    ▼
  helpers              cross-cutting mechanics   test/helpers/*.ts
    │                  Waits, gestures, alerts, purchases, flags.
    ▼
  config               how a run is wired        config/, wdio.*.conf.ts
                       Capabilities, hooks, artefacts, masking.
```

The rule each arrow encodes:

- **A spec never contains a selector.** If it does, the screen has no page object yet.
- **A page object never contains an assertion.** It reports; the spec judges. An `expect`
  inside a page object puts the failure message on the helper instead of the test.
- **A page object never spans screens.** A method that walks four screens is a shared step,
  not a screen's behaviour.

## Where each concern lives

| Concern | File | Note |
|---|---|---|
| App identity (bundle id, package, binary) | `config/app.config.ts` | The only place. Porting to another app is an `.env` edit. |
| Everything a wdio config shares | `config/wdio.shared.conf.ts` | Reporters, timeouts, progress lines, failure screenshots, artefact cleanup. |
| iOS local (sim + real device) | `wdio.ios.conf.ts` | One file for both; `scripts/run-ios-sim.sh` overrides the real-device vars per run. |
| iOS real-device cloud | `wdio.ios.cloud.conf.ts` | No Appium service, no WDA caps, status reported back in `after`. |
| Android | `wdio.android.conf.ts` | Adds screen recording on failure. |
| Timeouts | `test/helpers/constants.ts` | Never hardcode one in a page object. |
| Waiting, racing outcomes | `test/helpers/polling.ts` | See "Snapshot vs poll" below. |
| Blind taps, swipes, scrolling | `test/helpers/gestures.ts` | Last resort; fractions, not pixels. |
| iOS system alerts | `test/helpers/alerts.ts` | For runs with `autoAcceptAlerts` off. |
| StoreKit sandbox purchase | `test/helpers/applePaySandbox.ts` | App-agnostic; starts at Apple's sheet. |
| Feature-flag pinning | `test/helpers/featureFlags.ts` | Proxy Map Local + app restart. |
| Selector idioms | `test/helpers/locators.ts` | Encodes the iOS `nil`/`name`/`label` traps. |
| Page-object base | `test/helpers/basePage.ts` | wait-then-act, so no page object has to remember. |
| Pre-flight gating | `test/helpers/preflight.ts`, `test/checks.ts` | Fail before leasing the device. |
| Secret masking | `test/helpers/logMasking.ts` | Wired into every config's `maskingPatterns`. |
| Orphaned-WDA cleanup | `test/helpers/wdaCleanup.ts` | Runs in `onPrepare`; see the pitfalls below. |

## The four things that cost real debugging cycles

These are not general advice. Each one was paid for in the project this framework was
extracted from.

### 1. A green run is not proof

A spec that tolerates a missing precondition by logging `[skip]` and passing reports coverage
it does not have. One such branch hid a plain selector bug for two full runs and reported it
as a benign skip. After any run, grep the log for `[skip]` and decide whether each one is
genuinely benign — and prefer not writing the branch at all.

### 2. Open the failure screenshot before touching a selector

Screenshots land in `test-results/`, named after the failing case. Ask "is the target simply
covered by something modal?" first. A missed close tap was once attributed to a wrong
coordinate and burned a session; the real cause was a purchase-confirmation alert sitting on
top of the screen, visible in the screenshot all along.

### 3. Snapshot vs poll

`$$(...)`, `element.isDisplayed()` and `browser.getAlertText()` do **not** retry — unlike
`waitForDisplayed`. Three separate bugs were a one-shot query racing UI that was still
arriving. If you are checking something asynchronous, wait for it (`waitForValue`); if you are
checking which of two outcomes happened, race them (`race`) rather than testing one and then
the other.

And you cannot prove a negative by polling. "Zero rows matched" is not "the list is empty" —
a modal covering the screen gives the same answer. Require a positive empty-state signal.

### 4. Don't write a causal comment you haven't evidenced

Comments that cite their evidence are this codebase's best feature and its worst trap: two
confidently-wrong ones sent debugging down the wrong path for days. When you correct one, say
what disproved it. When you add a precautionary fix without a diagnosis, label it as
precautionary.

## Known iOS pitfalls

- **`nil` is not `""` in an NSPredicate.** A missing `name`/`label` attribute is `nil`, so
  `name == ""` never matches it. Use `(name == nil OR name == "")` — `iosNameEmptyOrMissing()`.

- **`name` vs `label`.** iOS reports an accessibility identifier as `name` on some builds and
  `label` on others, and Appium's `~` strategy matches `name` only. Match both —
  `iosNameOrLabel()`.

- **Typographic apostrophes.** "You're all set" renders with U+2019. A predicate containing a
  plain ASCII `'` silently never matches. Match on a fragment without one.

- **Apple Pay / StoreKit sandbox sheets are SpringBoard UI and invisible to XCUITest.**
  `applePaySandbox.ts` drives them with measured coordinate taps that are **per screen size**.
  Re-measure with `APPLEPAY_DEBUG=true` on a new device rather than assuming a purchase
  failure is an app bug.

- **`appium:autoAcceptAlerts` reaches alerts your own queries cannot.** On a real device it is
  the only thing that dismisses the StoreKit "You're all set" confirmation — our own dismissal
  helper logged "nothing to dismiss" on runs where the dialog was demonstrably on screen, and
  the measured OK coordinate was never tapped. So: detection here is blind, and "nothing to
  dismiss" in a log is **not** evidence that nothing was there.

- **A cancelled run orphans its WDA build.** Ctrl+C kills the Appium server but not the
  `xcodebuild ... WebDriverAgentRunner` it spawned; the orphan keeps the device's only XCTest
  session and the next run dies with `XCTDaemonErrorDomain Code=41` in under a second.
  `killOrphanedWdaBuilds()` runs in `onPrepare` for exactly this.

- **A failed session can uninstall the WDA runner**, and iOS drops a developer identity's
  trust once its last app is gone — so the next run needs Settings → General → VPN & Device
  Management by hand. `IOS_USE_PREINSTALLED_WDA=true` prevents it.

## Reading a run

Never pipe a raw wdio log into a terminal or an agent's context — one real-device run is
6,000+ lines, almost all protocol noise. Instead:

```bash
npm run wdio:ios -- --spec test/ios/specs/foo.spec.ts > run.log 2>&1
npm run summary                          # pass/fail table + failure messages
grep -E '\[ApplePay\]|\[alert\]|\[skip\]|\[race\]' run.log
```

Every helper logs under a bracketed prefix so the log stays greppable.
