# TEMPLATE — Example: log in with valid credentials

<!--
Copy into testcases/<platform>/<name>.md, named identically to its spec.
Read testcases/README.md for the house style before editing.
-->

| Field | Value |
|---|---|
| **Spec** | `test/ios/specs/example.spec.ts` |
| **Account** | Existing user with a verified email |
| **Runs on** | Simulator + real device |
| **Feature flags** | `PRESETS.loginV2` — `login_redesign: on` |

---

### C10001 — Log In screen is shown on launch

**Preconditions:** App freshly installed, no session stored.
**Test data:** —

Given the app is launched for the first time
Then the "Log In" screen is displayed
And the "Log In" button is visible

**Automated:** `should display the Log In screen on app launch`

---

### C10002 — Valid credentials sign the user in

**Preconditions:** The Log In screen is displayed.
**Test data:** `TEST_USERNAME` / `TEST_PASSWORD`

Given the user is on the "Log In" screen
When they enter valid credentials and tap "Log In"
Then the home screen is displayed

**Coverage:** The step races the home screen against the inline error, so a rejected
credential fails here rather than timing out on the home screen. It does not assert *which*
error is shown.

**Automated:** `should sign in and land on the home screen`

---

## Manual-only cases

### C10003 — Password is masked while typing

**Preconditions:** The Log In screen is displayed.

Given the user is typing into the password field
Then the characters are rendered as dots

**Automated:** — XCUITest reads a secure field's value as a masked placeholder regardless of
what is displayed, so automating this would assert the framework's behaviour rather than the
app's.
