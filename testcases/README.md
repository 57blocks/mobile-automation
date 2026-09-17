# Test Case Catalogue

Gherkin test cases, versioned alongside the automation that runs them. This directory is the
source of truth for what the E2E suite covers — each case maps 1:1 to a spec step, so
coverage is reviewable in a PR diff instead of an external test-management tool.

## Structure

```
testcases/
├── README.md
├── ios/
│   ├── _shared.<sequence>.md     # step sequences reused by several flows
│   └── <flowName>.md             # one file per spec
└── android/
```

One file per spec, **named identically** (`newUser.signUp.md` ↔
`test/ios/specs/newUser.signUp.spec.ts`). Shared step sequences live in `_shared.*` files and
are referenced, not repeated — mirroring the shared step helpers in `test/helpers/` so docs
and code stay in lockstep.

## Flow file header

Every flow file starts with:

| Field | Meaning |
|---|---|
| **Spec** | Path to the automating spec file. A case with a **one-way side effect** (a real purchase, an account deletion) points at `test/<platform>/manual/`, not `specs/` — the configs' spec glob does not reach that directory, so a suite run can never trigger it. |
| **Account** | Test account type the flow needs (new user / existing subscriber / …) |
| **Runs on** | `Simulator + real device`, or `Real device only` — with the reason (purchase flows can't run on a simulator because the StoreKit sandbox needs a real device) |
| **Feature flags** | The preset that defines this variant, and the overrides that distinguish it |

That table is authoritative. It is what tells a reader — or an agent — which spec automates
the case, what account state it needs, and whether it can run without a phone on the desk.

## Case anatomy

```markdown
### C<id> — <case title>

**Preconditions:** State required before the action — one line.
**Test data:** Accounts, inputs, or feature flags the case depends on ("—" if none).

Given <single precondition>
When <single action>
Then <single observable result>
And <additional observable result>

**Coverage:** <only when automation is narrower than the case, or drives something blindly>
**Automated:** `<exact it() title from the spec>`
```

Case headings carry the id from whatever test-management tool is the system of record — there
is no separate numbering scheme here. A step that maps to two cases uses both
(`### C92844 / C92847 — …`). A step with no case there yet uses a descriptive heading with the
gap named inline: `### <title> (no case yet)`. Pure-assertion cases (a screen state with no
user action) may omit the When line.

## Rules (house style)

- **Atomic cases.** One precondition/action/result unit per case, one `it()` per case. Don't
  chain a whole navigation flow into a single case; the next case's precondition is the
  previous case's result. This is what makes a failure point at a screen rather than a flow.

- **Quote UI copy exactly** as it appears on screen (`"Get Started"`, `"Enter code"`).

- **Honest assertions only.** A Then line states what the mapped `it()` *actually verifies*.
  Anything the automation drives blindly — coordinate taps, auto-accepted system alerts — or
  merely implies is said so in parentheses. A spec step that exists but asserts nothing is a
  stub: its case is manual-only, not automated.

  This is the rule that matters most. A catalogue that overstates its coverage is worse than
  no catalogue, because it is trusted.

- **Flags go in the header**, not in Given lines. A case's **Preconditions** may additionally
  name the specific flag that gates that screen.

- **Coverage** (optional) states where the automation is narrower than the case, or drives UI
  blindly. Honesty notes live here, never inside the Gherkin body.

- **Automated** holds the exact `it()` title, in full — no elisions, it must be greppable — so
  a failing spec line maps back to its case. Cases with no real automation say
  `**Automated:** —` with the reason, and sit under a `## Manual-only cases` heading.

## Why 1:1

The mapping is the point. Given a red line in a report you can find the case it belongs to
without reading the spec; given a case you can tell whether it is genuinely covered without
reading the spec either. Both break the moment an `it()` covers two cases or a case is
automated by "part of" a step — so when a case grows a second assertion, split the case.

See `templates/example.testcase.md` for a filled-in skeleton.
