# INF-280 — Service Worker `onMessageExternal` Listener

[Linear: INF-280](https://linear.app/wildfire-systems/issue/INF-280)

## What Was Fixed

The background service worker init was audited and a new `handleOnMessageExternal` listener was
added, wired to `browser.runtime.onMessageExternal`. This enables cross-extension and
trusted-webpage messaging, driven by DSL instructions configured under
`backgroundConfig.triggers.onMessageExternal.instructions`.

Additionally:
- `onMessageExternal` was added to the `TBackgroundEvent` union type
- The previously empty `catch` block in `initializeWorker` was given an explanatory comment

## Test Cases

### 1. Listener Registers Without Error
On service worker startup, `handleOnMessageExternal` is registered on
`browser.runtime.onMessageExternal` without throwing. Verify the service worker starts cleanly
with no console errors related to this listener.

### 2. No-op With Empty Instructions
When `triggers.onMessageExternal.instructions` is absent or empty in the background config,
sending an external message should return early cleanly — no errors, no state changes.

### 3. Instructions Execute on External Message
When `triggers.onMessageExternal.instructions` contains a valid instruction set, sending an
external message from a trusted origin must trigger instruction execution. Verify the
side-effect (e.g. storage change) occurs.

### 4. Execution Context Contains Expected Keys
The context passed to instructions during `onMessageExternal` must include:
- `event: 'onMessageExternal'`
- `timestamp` (number)
- `message` (original message payload)
- `sender` (runtime.MessageSender)
- `tabId` (sender.tab.id if available)

### 5. Error Isolation — Service Worker Does Not Crash
Sending a malformed or unexpected external message must be caught and logged. The service
worker must remain active and not restart.

### 6. Service Worker Is Active After Init
After the extension loads, the service worker must be in an active state — no init errors
should have caused it to fail silently.

## Prerequisites

- Run `pnpm build:dev:chrome` from the repo root before running tests
- Extension build output: `packages/partner/chrome-extension-build`
- `browser.runtime.onMessageExternal` requires the extension to have a valid `externally_connectable`
  manifest entry for the test origin, OR the test must send from a trusted extension.
  For local testing, sending messages from the page context is used as an approximation.
