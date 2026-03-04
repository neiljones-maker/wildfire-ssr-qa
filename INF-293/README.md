# INF-293 — Belk Injection Point Fix

[Linear: INF-293](https://linear.app/wildfire-systems/issue/INF-293)

## What Was Fixed

The extension custom element was previously appended to `document.body`. Sites like Belk.com use
SSR with client-side hydration, which causes React to replace the entire `<body>` during the
rehydration phase — orphaning the extension element from the live DOM.

**Fix:** The injection point was changed from `document.body.appendChild(customElement)` to
`document.documentElement.appendChild(customElement)`. The `<html>` element is never replaced
during hydration, so the extension survives the full hydration lifecycle.

## Test Cases

### 1. Belk.com — Extension Survives Hydration
Navigate to belk.com. After full page load and React hydration, the extension custom element
must still be present and attached to the live DOM.

### 2. Extension Host is a Child of `<html>`, Not `<body>`
On any partner site, confirm the extension's custom element is a **direct child of
`document.documentElement`**, not `document.body`.

### 3. Body Replacement Simulation — Extension Survives
Programmatically replace `document.body` with a new element (simulating hydration). The extension
custom element must remain in the DOM tree and not be garbage-collected.

### 4. Fade-in Animation Fires After `documentElement` Append
The `requestAnimationFrame` callback that sets `opacity: 1` must still fire correctly when the
host is appended to `documentElement` instead of `body`.

### 5. No Regression on Standard (Non-Hydrating) Sites
On macys.com the extension should load and display normally — confirming the injection point change
does not break standard page scenarios.

## Prerequisites

- Run `pnpm build:dev:chrome` from the repo root before running tests
- Extension build output: `packages/partner/chrome-extension-build`
- Belk.com test requires network access to an active Wildfire-eligible merchant
