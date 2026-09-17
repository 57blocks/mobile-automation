# mobile-automation

An Appium + WebdriverIO end-to-end automation framework for iOS and Android, in TypeScript.

This is the **framework only** — configs, a page-object base, cross-cutting helpers, tooling
and conventions. It ships no page objects, specs or test cases for any particular app; those
are yours to add. It was extracted from a production mobile suite: where a comment explains
why something is shaped oddly, it is recording a debugging cycle somebody already paid for.
The long-form versions are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## What's in it

| | |
|---|---|
| **Three wdio configs** | iOS local (simulator *and* real device, one file), iOS real-device cloud, Android — all sharing one base so they cannot drift. |
| **Page-object base class** | `wait → act` built in, so no page object has to remember to wait. |
| **Waiting primitives** | `waitForValue`, `race`, `withoutRetries` — the snapshot-vs-poll trap, solved once. |
| **iOS alert handling** | For runs where `autoAcceptAlerts` has to be off. |
| **StoreKit sandbox purchases** | App-agnostic driver for Apple's payment sheet, which XCUITest cannot see. |
| **Feature-flag pinning** | Proxy Map Local + app restart, so a spec gets the variant it was written for. |
| **Secret masking** | Credentials typed into the app never reach a log file. |
| **Pre-flight gating** | Fail on a dead test account *before* leasing a device for fifteen minutes. |
| **Real-device hygiene** | Orphaned-WebDriverAgent cleanup, preinstalled-WDA support, build provenance stamps. |
| **Live-device inspection** | The official Appium MCP server, capabilities generated from the same `.env` — so locators get discovered, not guessed. |
| **Reporting** | Allure + spec reporter, failure screenshots named after the case, a Markdown summary for CI. |
| **Conventions** | A test-case catalogue that maps 1:1 to specs, and a Claude Code agent that follows it. |

## Requirements

- Node 22 (`.nvmrc`)
- Xcode + Command Line Tools (iOS), Android SDK platform-tools (Android)
- Appium 3 drivers: `xcuitest`, `uiautomator2` — `npm run doctor` checks both

## Getting started

```bash
npm install                   # or npm ci — the lockfile is committed
cp .env.example .env          # fill in APP_NAME, IOS_BUNDLE_ID, device details
npm run doctor                # verify the Appium drivers
npm run typecheck && npm run lint   # should both be silent
```

Then wire up your app:

1. **Identify it.** Set `APP_NAME`, `IOS_BUNDLE_ID`, `ANDROID_APP_PACKAGE`,
   `ANDROID_APP_ACTIVITY` in `.env`. Nothing else hardcodes the app — see
   `config/app.config.ts`.
2. **Supply a binary.** Drop an `.ipa`/`.apk` in `apps/`, or build a simulator app with
   `npm run refresh:ios-sim-app` (set `APP_SOURCE_DIR` first). With no binary, Appium launches
   whatever is already installed.
3. **Write your first screen.** Copy `templates/example.page.ts` into
   `test/ios/pageobjects/<feature>/`. Don't guess selectors — read them off the device, see
   [Inspecting a live device](#inspecting-a-live-device).
4. **Write its case, then its spec.** `templates/example.testcase.md` →
   `testcases/ios/<name>.md`, then `templates/example.spec.ts` →
   `test/ios/specs/<name>.spec.ts`. Same name on both sides.
5. **Add pre-flight checks** for whatever makes a run unrunnable — see `test/checks.ts`.

## Running

| Target | Command |
|---|---|
| iOS simulator, one spec | `npm run wdio:ios:sim -- --spec test/ios/specs/<name>.spec.ts` |
| iOS real device, one spec | `npm run wdio:ios -- --spec test/ios/specs/<name>.spec.ts` |
| iOS real device, everything | `npm run wdio:ios` |
| iOS cloud (real device) | `npm run wdio:ios:cloud` |
| Android | `npm run wdio:android` |
| Pre-flight only | `npm run preflight` |
| Typecheck | `npm run typecheck` |
| Lint (before finishing) | `npm run lint` |
| Failure summary | `npm run summary` |

Non-obvious requirements:

- A real device needs the RemoteXPC tunnel up:
  `sudo node_modules/.bin/appium driver run xcuitest tunnel-creation`.
- Simulator runs need a built `.app` in `apps/` (`npm run refresh:ios-sim-app`).
- `npm run wdio:ios:sim` with no arguments runs `--suite simulator`, and that suite ships
  **empty** — fill in `suites.simulator` in `wdio.ios.conf.ts` with the specs that pass
  without a real device, or the run exits with "No specs found".
- Any spec with a **one-way side effect** — a real purchase, an account deletion — goes in
  `test/<platform>/manual/`, not `specs/`. The configs' spec glob does not reach that
  directory, so a suite run can never trigger it, and you run it by hand:
  `npm run wdio:ios -- --spec test/ios/manual/<name>.spec.ts`. Never loop one to "try again":
  nothing reverts it, and a human has to reset state before the next run.

**Never pipe a raw wdio log into your terminal or an agent's context** — one real-device run
is 6,000+ lines. Redirect it to a file, read the summary, then grep for the `[Prefix]` you
care about.

```bash
npm run wdio:ios -- --spec test/ios/specs/foo.spec.ts > run.log 2>&1
npm run summary
grep -E '\[ApplePay\]|\[alert\]|\[skip\]' run.log
```

CI is `.github/workflows/ios-cloud-tests.yml` — `workflow_dispatch` only, because a cloud
real-device run costs device minutes and can mutate shared account state. It typechecks,
lints, runs the cloud suite, and publishes the Allure report to GitHub Pages.

## Inspecting a live device

`.mcp.json` wires up the official [Appium MCP server](https://github.com/appium/appium-mcp),
so an agent working in this repo can drive a real device or simulator and read the actual
element tree instead of guessing a selector.

- **Capabilities come from your `.env`**, generated by `scripts/write-mcp-capabilities.ts` on
  every server launch. There is no second place to configure the app under test.
- The session **attaches to the installed build and does not reset it** — reinstalling would
  wipe the state you wanted to look at. `MCP_INSTALL_APP=true` if you do want an install.
- `autoAcceptAlerts` is **off** there, the reverse of a test run, so the dialogs a run would
  swallow stay on screen where you can read them.
- First launch downloads the server through `npx` and takes a few minutes; after that it is
  cached. Claude Code will ask you to trust the project server once — `/mcp` lists it.

Screenshots the session takes land in `mcp-captures/` — deliberately not `test-results/`,
which a test run wipes on start.

`npm run mcp:capabilities` writes the capabilities file on its own if you want to check what
the session will get.

## Project structure

```
wdio.ios.conf.ts            iOS local — simulator and real device
wdio.ios.cloud.conf.ts      iOS on a real-device cloud (LambdaTest / TestMu)
wdio.android.conf.ts        Android emulator or device
config/
  app.config.ts             the only place the app under test is identified
  wdio.shared.conf.ts       everything the three configs share
test/
  checks.ts                 your pre-flight checks (ships empty)
  helpers/                  cross-cutting mechanics (+ its own CLAUDE.md)
  ios/pageobjects/          one class per screen
  ios/specs/                one spec per test-case file
  ios/debug/                throwaway debug specs — outside the spec glob on purpose
  ios/manual/               one-way side effects (purchases, deletions) — run by hand only
  android/…                 same shape
  preflight/                the checks that need a driver, run via `npm run preflight`
  fixtures/featureFlags/    written at runtime, served by your proxy
  fixtures/mcp/             capabilities for the MCP server, generated from .env
testcases/
  ios/ android/             Gherkin cases, 1:1 with specs — see its README and CLAUDE.md
templates/                  copy-and-adapt page object, spec, and case file
scripts/
  run-ios-sim.sh            detect a booted sim, override real-device vars for one run
  refresh-ios-sim-app.sh    build the app for the simulator, stamp its provenance
  preflight.ts              run the pre-flight checks without running a flow
  summarize-allure.ts       pass/fail table + failure messages (also a CI job summary)
  appium-mcp.sh             launch the MCP server with capabilities built from .env
  write-mcp-capabilities.ts
  upload-ios-app-to-cloud.ts
mcp-captures/               screenshots from an MCP inspection session (git-ignored)
apps/                       the .ipa / .apk / .app under test (git-ignored)
.env.example                every variable the framework reads, with what it is for
.github/workflows/          cloud run on workflow_dispatch, Allure report to Pages
.mcp.json                   the Appium MCP server, for live-device inspection
tsconfig.json               strict, NodeNext, no emit — tsx runs the sources
eslint.config.js            flat config, typescript-eslint
docs/ARCHITECTURE.md        layering, the four guardrails, iOS pitfalls
CLAUDE.md                   the same ground, condensed for an agent in this repo
```

## Conventions

- **TypeScript throughout, run directly by `tsx` — there is no build step.** Relative imports
  still carry a **`.js`** extension (`./constants.js` resolves to `constants.ts`); that is what
  `moduleResolution: NodeNext` requires. `tsc` is only ever a checker here (`--noEmit`).
- TypeScript is pinned to `~6.0.3`, not `^`: typescript-eslint's peer range is `<6.1.0`, so a
  caret would pull in a version it refuses to run against.
- 4-space indent, single quotes, semicolons. `npm run typecheck` and `npm run lint` must both
  be clean.
- Page objects: one class per screen, default-exported as a singleton, in
  `test/<platform>/pageobjects/<feature>/`. No assertions, no cross-screen flows.
- Locator priority: accessibility id → predicate / resource-id → class chain → xpath (last
  resort).
- Timeouts come from `test/helpers/constants.ts`. Don't hardcode.
- Specs and test-case files are same-named and 1:1. Each `it()` title is quoted verbatim in
  its case's `**Automated:**` line.
- Throwaway debug specs go in `test/<platform>/debug/<name>.spec.ts` — outside the configs'
  spec globs, so a suite run never picks them up while `--spec` still can. They carry a
  comment saying what question they exist to answer, and are **deleted once answered**.

## Read next

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the layering, the four guardrails that cost
  real debugging cycles, and the known iOS pitfalls. Read this before writing helpers.
- [`testcases/README.md`](testcases/README.md) — the test-case house style, including the
  honest-assertion rule.
- [`CLAUDE.md`](CLAUDE.md) — the same ground, condensed for an agent working in this repo.
  `testcases/` and `test/helpers/` carry their own, loaded when you work in them.
