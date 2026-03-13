# Competing Extensions — INF-346 Test Setup

Place unpacked extension directories here for the INF-346 real-extension tests.

```
tests/e2e/competing-extensions/
├── honey/           ← Honey extension (unpacked)
├── capital-one/     ← Capital One Shopping (unpacked)
└── rakuten/         ← Rakuten extension (unpacked)
```

## How to obtain an unpacked extension

1. Install the extension from the Chrome Web Store in a normal Chrome profile.
2. Navigate to `chrome://extensions` → enable **Developer mode** (top-right toggle).
3. Find the extension in the list, note its **ID**.
4. Locate the directory on disk:
   - **macOS:** `~/Library/Application Support/Google/Chrome/Default/Extensions/<id>/<version>/`
   - **Linux:** `~/.config/google-chrome/Default/Extensions/<id>/<version>/`
5. Copy (do not move) that versioned directory to the appropriate path above, e.g.:

```bash
cp -r \
  ~/Library/Application\ Support/Google/Chrome/Default/Extensions/bmnlcjabgnpnenekpadlanbbkooimhnj/4.14.1_0 \
  tests/e2e/competing-extensions/honey
```

## Extension IDs (Chrome Web Store)

| Extension              | Chrome Web Store ID                      |
|------------------------|------------------------------------------|
| Honey                  | `bmnlcjabgnpnenekpadlanbbkooimhnj`       |
| Capital One Shopping   | `nenlahapcbofgnanklpelkaejcehkggg`       |
| Rakuten                | `chhjbpecpancjgbekjhcgfjhkginbge`        |

## Environment variable override

Instead of placing directories here you can point the tests at any path via env vars:

```bash
HONEY_EXTENSION_PATH=/path/to/honey \
CAP1_EXTENSION_PATH=/path/to/capital-one \
RAKUTEN_EXTENSION_PATH=/path/to/rakuten \
pnpm test:inf-346
```

## Note

These directories are git-ignored. Extension files must never be committed to the repo.
