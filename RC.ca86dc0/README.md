# RC — Install Flow: Onboarding Tab & Login CTA

## Feature

Upon extension install the background service worker opens a new tab to the
configured installation URL (`example.com` in the development build). That tab
receives a one-time onboarding UI injected by the content script, showing an
installation-success message and a CTA that lets the user log in.

---

## Test Plan

### Precondition

The Playwright fixture creates a **fresh user data directory** on every run, so
`chrome.runtime.onInstalled` always fires with `reason: 'install'`. No manual
setup is required.

---

### RC-1 — Install tab opens automatically

**What it tests:** The `onExtensionInstalled` DSL trigger fires and the tab
primitive opens a new tab.

**Steps:**
1. Extension loads in a fresh Chrome context (fixture)
2. After the service worker registers, wait for any page whose URL contains
   `example.com`

**Expected:** A tab with `example.com` in its URL exists within 15 s of the
service worker registering.

---

### RC-2 — Install tab URL is the configured installation URL

**What it tests:** The correct URL is used (not a random page).

**Steps:**
1. Obtain the install tab from RC-1
2. Read `page.url()`

**Expected:** URL contains `example.com`.

---

### RC-3 — Extension injects the onboarding UI into the install tab

**What it tests:** The content script runs on the install tab and the host
element appears, confirming the one-time UI is active.

**Steps:**
1. Obtain the install tab
2. Wait for an element whose tag name contains `-` AND whose inline
   `style.transition` includes `opacity` (unique to our `injectNotification()`
   host element)

**Expected:** The host element is found within 10 s.

---

### RC-4 — Onboarding UI is a one-time experience (does not re-appear on reload)

**What it tests:** The UI is shown only once, not on every subsequent visit to
the install URL.

**Steps:**
1. Obtain the install tab
2. Reload the page
3. Wait 3 s
4. Check for the onboarding host element

**Expected:** The host element is **absent** after a normal reload (the
one-time flag prevents re-injection).

---

### RC-5 — Login CTA is present on the onboarding UI

**What it tests:** A login affordance is discoverable on the install tab.

**Steps:**
1. Obtain the install tab and wait for the host element
2. Search the page's visible text and link `href` values for login-related
   strings (`log in`, `login`, `sign in`)

**Expected:** At least one login CTA is found.

**Note:** If the login button lives inside the extension's closed shadow root,
Playwright cannot query it directly. In that case this test verifies the
presence of any login-related affordance reachable in the light DOM
(e.g. a link set by the extension as a sibling of the host element, or an
`<a>` rendered by the install page itself).

---

## Shadow DOM Caveat

The extension host element uses `mode: 'closed'`, so Playwright selectors
cannot pierce the shadow root. All internal UI assertions use `page.evaluate()`
running inside the page's JS context.
