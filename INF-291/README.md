# INF-291 — Font Declaration Injection

[Linear: INF-291](https://linear.app/wildfire-systems/issue/INF-291/font-declaration-injection)

## What Was Fixed

- `injectNotification` no longer accepts or injects `fontDeclarations` as an inline `<style>` child
  element. Fonts are now bundled and loaded via webpack.
- `mainElement` (the custom element host) and `shadowRootElement` are now passed through
  `ContentApp` → `InstructionsExecutorProvider` and exposed on the instruction execution context,
  making both available to DSL instructions at runtime.

## Test Cases

### 1. Font Rendering
Load the extension on a partner page (e.g. a Walmart/411 page). Confirm partner fonts (Bogle,
EverydaySans) render correctly inside the extension UI with no FOUT or missing glyphs.

### 2. No Inline `<style>` Font Injection
Inspect the extension's custom element host node. Confirm **no inline `<style>` tag** containing
font declarations is injected as a direct child — fonts load via the webpack bundle, not inline CSS.

### 3. `mainElement` in Instruction Context
The execution context passed to all DSL instructions must include a `mainElement` key referencing
the live HTMLElement host node (the same element attached to `document.documentElement`).

### 4. `shadowRootElement` in Instruction Context
The execution context must include a `shadowRootElement` key referencing the extension's closed
ShadowRoot. DSL instructions that use `render.domQuery` should query within this shadow root.

### 5. Fade-in Animation Still Works
The custom element should start at `opacity: 0` and transition to `opacity: 1` via
`requestAnimationFrame` after mounting — confirming the render cycle is intact after refactoring.

## Prerequisites

- Run `pnpm build:dev:chrome` from the repo root before running tests
- Extension build output: `packages/partner/chrome-extension-build`
