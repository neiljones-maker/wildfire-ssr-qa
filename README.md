# E2E Tests — Wildfire SSR Extensions

Playwright end-to-end tests for browser extension fixes. Each subfolder maps to a Linear ticket.

## Structure

```
tests/e2e/
├── playwright.config.ts      # Shared Playwright config (extension path, browser args)
├── package.json              # Playwright dependency
├── INF-291/
│   ├── README.md             # Test plan: font injection / mainElement context
│   └── inf-291.spec.ts
├── INF-293/
│   ├── README.md             # Test plan: Belk injection point (body → html)
│   └── inf-293.spec.ts
└── INF-280/
    ├── README.md             # Test plan: onMessageExternal listener
    └── inf-280.spec.ts
```

## Prerequisites

1. **Build the extension first:**
   ```bash
   pnpm build:dev:chrome
   ```
   Output lands at `packages/partner/chrome-extension-build/`.

2. **Install Playwright:**
   ```bash
   cd tests/e2e
   pnpm install
   pnpm exec playwright install chromium
   ```

## Running Tests

```bash
cd tests/e2e

# All tests
pnpm test

# One ticket at a time
pnpm test:inf-291
pnpm test:inf-293
pnpm test:inf-280

# View HTML report after a run
pnpm report
```

## Notes

- Tests run in **non-headless** Chrome (required for extension loading)
- The INF-280 external message test is skipped until `externally_connectable` is added to the
  manifest — see the skip comment in `INF-280/inf-280.spec.ts` for instructions
- Shadow DOM is `mode: 'closed'` so inner shadow content cannot be queried directly via
  Playwright selectors; `page.evaluate()` is used for host-element assertions
