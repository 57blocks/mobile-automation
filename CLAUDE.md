# CLAUDE.md

Appium + WebdriverIO E2E automation framework for mobile apps (iOS + Android). App-agnostic
core — page objects, specs and test cases for a specific app are added on top.

## Where the docs are

Read these rather than re-deriving their contents:

- [`README.md`](README.md) — setup, structure, commands, conventions.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the layering, the four guardrails, the iOS
  pitfalls. **The single most useful file in the repo.**
- [`testcases/README.md`](testcases/README.md) — the house style for test cases.

Two directories carry their own `CLAUDE.md`, loaded automatically when you work in them:
`testcases/` (the case house style, imported in full) and `test/helpers/` (the app-agnostic
rule and what not to re-implement).

`testcases/*.md` and `test/{platform}/specs/*.spec.ts` are 1:1 and same-named, and the case
file's header table is authoritative — see `testcases/CLAUDE.md` for what each column means.

## Running tests

| Target | Command |
|---|---|
| iOS simulator | `npm run wdio:ios:sim -- --spec test/ios/specs/<name>.spec.ts` |
| iOS real device | `npm run wdio:ios -- --spec test/ios/specs/<name>.spec.ts` |
| iOS cloud | `npm run wdio:ios:cloud` |
| Android | `npm run wdio:android` |
| Pre-flight only | `npm run preflight` |
| Typecheck | `npm run typecheck` |
| Lint (always before finishing) | `npm run lint` |
| Failure summary | `npm run summary` |

Non-obvious requirements:

- Real device needs the RemoteXPC tunnel up:
  `sudo node_modules/.bin/appium driver run xcuitest tunnel-creation`.
- Simulator runs need a built `.app` in `apps/` (`./scripts/refresh-ios-sim-app.sh`).
- Any spec with a **one-way side effect** — a real purchase, an account deletion — goes in
  `test/{platform}/manual/`, which the spec glob does not reach, and is run by hand with
  `--spec`. A purchase changes the account one way and nothing reverts it; a human has to
  reset state before the next run. **Never loop such a spec to "try again".**

**Never pipe a raw wdio log into your context** — a single real-device run is 6,000+ lines.
Redirect it to a file, then read `npm run summary` (pass/fail table +
failure messages) and grep the log for `[SomeHelper]` prefixes.

## Writing tests

Page objects in `test/{platform}/pageobjects/<feature>/`, one class per screen, extending
`test/helpers/basePage.ts`, default-exported as a singleton. Locator priority: accessibility
id → predicate / resource-id → class chain → xpath (last resort). Timeouts come from
`test/helpers/constants.ts` (`SCREEN_TIMEOUT` 15 s, `ELEMENT_TIMEOUT` 10 s) — don't hardcode.

Reuse before writing: the mechanic you need is probably already in `test/helpers/` (waiting,
gestures, alerts, purchases, flags, selector builders) — the concern → file table is in
`docs/ARCHITECTURE.md`. Shared multi-screen step sequences go in `test/helpers/*Steps.ts`,
not inlined into each spec.

Start from `templates/` — page object, spec and case file skeletons, with the reasons for each
convention written in.

## Inspecting a live device

Don't guess a selector. The official Appium MCP server (`appium-mcp`, wired up in
`.mcp.json`) drives a real device or simulator from this session: `select_device` →
`appium_session_management action=create` → `appium_get_page_source` / `generate_locators`.
On a real device run `appium_prepare_ios_real_device` first; on a simulator,
`prepare_ios_simulator`.

- Capabilities are generated from `.env` by `scripts/write-mcp-capabilities.ts` on every
  server launch. Don't hand-write them — that would be a second place the app under test is
  identified.
- The session attaches to the installed build and does **not** reset it. `MCP_INSTALL_APP=true`
  if you want a reinstall.
- `autoAcceptAlerts` is off there on purpose, so the dialogs a test run swallows stay visible.
- **Never hold a raw page source in your context** — one screen is ~17k characters. Write it
  to a scratch file, extract the candidate locators, work from those.
- Screenshots the session takes land in `mcp-captures/`, not `test-results/` — the latter is
  wiped at the start of every run, and inspection captures are taken before the run they
  inform.
- **Close the session when you are done.** An open session holds the device's only XCTest
  session, and the next run then fails with `XCTDaemonErrorDomain Code=41`.

`/automate-testcase` delegates all of this to the `case-implementer` agent.

## Guardrails

These four cost real debugging cycles in the suite this framework came from. They are not
general advice.

**1. A green run is not proof.** A spec that tolerates an environment gap by logging `[skip]`
and passing reports coverage it does not have. One such branch hid a pure selector bug for two
full runs. After any run, grep for `[skip]` and judge each one — and prefer not writing the
branch at all.

**2. Open the failure screenshot before touching a selector or a coordinate.** Screenshots
land in `test-results/` named after the failing case. Ask "is the target simply covered by
something modal?" first — a missed close tap once got attributed to a wrong coordinate and
burned a session; the real cause was a purchase-confirmation alert sitting on top of the
screen, visible in the screenshot all along.

**3. Snapshot vs poll.** `$$(...)`, `element.isDisplayed()` and `browser.getAlertText()` do
**not** retry — unlike `waitForDisplayed`. Three separate bugs were a one-shot query racing UI
that was still arriving. If you are checking something asynchronous, wait for it
(`waitForValue`); if you are checking two possible outcomes (success vs an error dialog), race
them (`race`) rather than testing one then the other. And you cannot prove a negative by
polling — "zero rows matched" is not "the list is empty".

**4. Don't write a causal comment you haven't evidenced.** Comments here cite their evidence,
which is good — but two of them were confidently wrong and sent debugging down the wrong path.
When you correct one, say what disproved it. When you add a precautionary fix without a
diagnosis, label it as precautionary.

## Known iOS pitfalls

- **`nil` is not `""` in an NSPredicate.** A missing `name`/`label` attribute is `nil`, so
  `name == ""` never matches it. Use `(name == nil OR name == "")`.
- iOS reports an identifier as `name` on some builds and `label` on others — match both
  (`iosNameOrLabel()` in `test/helpers/locators.ts`).
- Copy with a typographic apostrophe ("You're all set", U+2019) never matches a predicate
  containing a plain `'`. Match a fragment without one.
- Apple Pay / StoreKit sandbox sheets are SpringBoard UI and invisible to XCUITest;
  `test/helpers/applePaySandbox.ts` drives them with measured coordinate taps that are **per
  screen size**. Re-measure with `APPLEPAY_DEBUG=true` on a new device rather than assuming a
  purchase failure is an app bug.
- `appium:autoAcceptAlerts` reaches alerts your own queries cannot — on a real device it is
  the only thing that dismisses the StoreKit "You're all set" confirmation, while our own
  dismissal helper logged "nothing to dismiss" on runs where the dialog was demonstrably on
  screen. **Detection here is blind: "nothing to dismiss" is not evidence that nothing was
  there.**
- A cancelled run orphans its `xcodebuild ... WebDriverAgentRunner`, which keeps the device's
  only XCTest session; the next run then fails session creation with `XCTDaemonErrorDomain
  Code=41` in under a second — a daemon refusal, not a signing or tunnel problem.
  `killOrphanedWdaBuilds()` handles it in `onPrepare`.

## Conventions

- TypeScript throughout, run directly by `tsx` — there is no build step. Relative imports
  still carry a **`.js`** extension (`./constants.js` resolves to `constants.ts`): that is
  what `moduleResolution: NodeNext` requires, and it is why the migration changed no
  import statements.
- 4-space indent, single quotes, semicolons. `npm run typecheck` and `npm run lint` must
  both be clean (0 errors).
- Don't commit or push unless asked. Never commit `.env`.
- Throwaway debug specs go in `test/{platform}/debug/<name>.spec.ts` — outside the spec globs,
  so a suite run never picks them up and `--spec` still reaches them. They carry a comment
  saying what question they exist to answer, and are **deleted once answered**.
