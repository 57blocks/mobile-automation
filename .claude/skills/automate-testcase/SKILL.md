---
name: automate-testcase
description: Implement and debug the mobile automation spec for a test-case markdown file. Use when the user points at a testcases/**/*.md file and asks to automate it, implement its spec, or get its spec passing — e.g. "/automate-testcase testcases/ios/foo.md", "帮我把这个用例自动化", "implement the spec for this test case".
---

# Automate a test case

Turns one `testcases/**/*.md` file into a working, verified spec.

## Resolve the target

The argument is a path to a test-case file. If none was given, or the path does not exist,
list `testcases/**/*.md` alongside `test/*/specs/` and ask which case to implement — do not
guess.

Read the target file's header table before delegating. Two things decide how this goes, and
the user should hear them up front:

- **Runs on** — `Simulator + real device` means the work can close its own loop.
  `Real device only` means one slow run per attempt, and the user will have to supply account
  state between attempts.
- **Account** — if this needs state that must be reset by a human, say so now. Nothing
  downstream can create it.

If the spec named in the header already exists, say what is already there. This may be a
debugging job rather than a fresh implementation — both are in scope, but the user should know
which they are getting.

## Delegate

Hand the work to the `case-implementer` agent via the Agent tool, passing:

- the absolute path of the case file,
- the mode implied by **Runs on**,
- anything the user has already told you about device or account state (a device they just
  connected, an account they just reset) — that saves the agent a preflight round trip,
- whether they want it run now or implemented first and run later.

Run it in the background so the user can keep working; a real-device verification run takes
several minutes.

## Report back

The agent's report is not shown to the user — relay it. Keep its three groups separate and do
not collapse them into a pass count:

- **Verified** — assertions that ran and passed.
- **Passed via a tolerant branch** — `it()`s that logged `[skip]` and passed without checking
  anything. These are the ones that look green and are not.
- **Not verified** — what could not be run, and why.

Also relay any account state that changed and any precondition the user still needs to supply.
