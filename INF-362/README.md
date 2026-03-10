# INF-362 — Couponator: No-Savings Cashback UI

[Linear: INF-362](https://linear.app/wildfire-systems/issue/INF-362)

## What Was Fixed

When the couponator runs for a merchant but returns no applicable coupon codes (`Codes = []`), the
extension should display the **"You've got a great price!"** modal — confirming that coupons didn't
provide additional savings but the user's cashback rate is still active.

## Setup

Before running any test case, seed the store with an empty codes array via the service worker console:

1. Go to `chrome://extensions` and click **"service worker"** on the Wildfire extension.
2. Paste and run:

   ```js
   _primitiveHandler._primitives.store._store.couponData['macys.com'].Codes = []
   ```

3. Confirm the value:

   ```js
   _primitiveHandler._primitives.store._store.couponData['macys.com']
   // Expected: { ..., Codes: [] }
   ```

> **Note:** If `couponData['macys.com']` doesn't exist yet, navigate to macys.com and add an item
> to cart first (to let the extension populate the entry), then set `Codes = []` before proceeding
> to checkout.

## Test Cases

### 1. "You've got a great price!" Modal Appears

Navigate to macys.com, add any product to cart, and proceed to the cart or checkout page.
The Wildfire extension overlay should appear and display:

- A celebratory confetti/party-popper graphic
- Headline: **"You've got a great price!"**
- Body: **"Coupons applied didn't provide additional savings, but your X% cashback is activated."**
  (where X is the user's actual cashback rate for macys.com)
- A **"Continue to Checkout"** CTA button

### 2. No Coupon Codes Attempted

With `Codes = []` set, confirm that the couponator does **not** attempt to apply any coupon codes
to the cart. No coupon code strings should appear in the modal UI.

### 3. Cashback Rate Is Displayed

The body copy in the modal must reference the user's real cashback percentage for macys.com —
not a placeholder, zero, or an empty string.

### 4. "Continue to Checkout" Dismisses Modal

Clicking **"Continue to Checkout"** should close the extension overlay and allow the user to
proceed normally through the merchant's checkout flow without interruption.

### 5. No Error State

The modal must not show an error state, blank content, or fail to render. The empty `Codes` array
is an expected scenario and should be handled gracefully by the couponator FSM.

### 6. Reproducible on a Second Merchant

Repeat the setup and test cases 1–5 using a different merchant domain (e.g. `nordstrom.com`) to
confirm the behavior is not macys.com-specific.

## Prerequisites

- Run `pnpm build:dev:chrome` from the `wildfire-ssr-extensions` repo root before testing
- Extension build output: `packages/partner/chrome-extension-build`
- A Wildlink-activated account (cashback eligible for macys.com)
