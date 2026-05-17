# Turbo Frame & Stimulus Inspector

This is the initial implementation plan for the Turbo Frame & Stimulus Inspector extension.

It's a cross-browser DevTools extension that displays a tree outline of nested `<turbo-frame>` elements and Stimulus controllers (`data-controller` attributes) on the current page.

**Built with:** WXT + Vite + Vanilla JS
**Target browsers:** Chrome, Firefox, Safari, Edge
**Testing:** Vitest (unit) + Playwright (E2E)

---

## Project Structure (WXT)

```
browser-extension/
├── wxt.config.js           # WXT configuration
├── vite.config.js          # Vite configuration (extends WXT)
├── package.json            # Dependencies and scripts
├── entrypoints/
│   ├── devtools.html       # DevTools entry point
│   ├── devtools.js         # Creates the panel
│   ├── content.js          # Content script (DOM scanning)
│   └── panel/
│       ├── index.html      # Panel UI
│       ├── main.js         # Panel logic + tree rendering
│       └── style.css       # Panel styling
├── lib/
│   └── tree-builder.js     # Pure function: flat array → nested tree
├── tests/
│   ├── unit/
│   │   └── tree-builder.test.js
│   └── e2e/
│       ├── fixtures/
│       │   └── test-page.html    # Page with turbo-frames for testing
│       ├── extension.spec.js     # E2E tests
│       └── playwright.config.js
├── public/
│   └── icon.png            # Extension icon
└── README.md
```

---

## Implementation Steps

### Phase 1: Project Setup

#### 1.1 Initialize WXT project

```bash
npx wxt@latest init browser-extension
cd browser-extension
npm install
```

#### 1.2 Configure wxt.config.js

```js
import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Turbo Frame & Stimulus Inspector",
    permissions: ["activeTab", "scripting"],
    devtools_page: "devtools.html",
  },
  runner: {
    startUrls: ["http://localhost:4173"],
  },
});
```

#### 1.3 Configure Vite for testing

```js
// vite.config.js
import { defineConfig } from "vite";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.js"],
    globals: true,
  },
});
```

#### 1.4 Install dependencies

```bash
npm install -D vitest @vitest/ui
npm install -D playwright @playwright/test
npx playwright install chromium firefox webkit
```

#### 1.5 Add npm scripts

```json
{
  "scripts": {
    "dev": "wxt",
    "dev:firefox": "wxt -b firefox",
    "build": "wxt build",
    "build:firefox": "wxt build -b firefox",
    "build:safari": "wxt build -b safari",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:e2e": "playwright test",
    "test:e2e:headed": "playwright test --headed",
    "zip": "wxt zip",
    "zip:firefox": "wxt zip -b firefox"
  }
}
```

---

### Phase 2: Unit Tests First (TDD)

**Methodology: Strict Red-Green-Refactor**

Write ALL unit tests before implementation. Run tests to see them fail (Red), then implement (Green), then refactor.

#### 2.1 Create tree-builder tests

```js
// tests/unit/tree-builder.test.js
import { describe, it, expect } from "vitest";
import { buildTree } from "../../lib/tree-builder.js";

describe("buildTree", () => {
  it("returns empty array for empty input", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("returns single root frame with no children", () => {
    const input = [{ id: "main", src: "/page", parentId: null, tagName: "turbo-frame" }];
    const result = buildTree(input);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("main");
    expect(result[0].children).toEqual([]);
  });

  it("creates nested structure from parent-child relationship", () => {
    const input = [
      { id: "parent", src: null, parentId: null, tagName: "turbo-frame" },
      { id: "child", src: "/sub", parentId: "parent", tagName: "turbo-frame" },
    ];
    const result = buildTree(input);
    expect(result[0].children[0].id).toBe("child");
  });

  it("handles controller elements", () => {
    const input = [
      {
        id: "el-1",
        controllers: ["modal", "dropdown"],
        parentId: null,
        tagName: "div",
      },
    ];
    const result = buildTree(input);
    expect(result[0].tagName).toBe("div");
    expect(result[0].controllers).toEqual(["modal", "dropdown"]);
  });

  it("handles mixed frames and controllers", () => {
    const input = [
      { id: "frame-1", src: null, parentId: null, tagName: "turbo-frame" },
      {
        id: "ctrl-1",
        controllers: ["tabs"],
        parentId: "frame-1",
        tagName: "div",
      },
    ];
    const result = buildTree(input);
    expect(result[0].children[0].tagName).toBe("div");
  });

  it("handles frame with attached controllers", () => {
    const input = [
      {
        id: "frame-1",
        src: "/page",
        parentId: null,
        tagName: "turbo-frame",
        controllers: ["lazy"],
      },
    ];
    const result = buildTree(input);
    expect(result[0].tagName).toBe("turbo-frame");
    expect(result[0].controllers).toEqual(["lazy"]);
  });
});
```

#### 2.2 Run tests (should fail)

```bash
npm test
```

#### 2.3 Implement tree-builder.js to pass tests

---

### Phase 3: E2E Test Setup

#### 3.1 Create Playwright config

```js
// tests/e2e/playwright.config.js
import { defineConfig } from "@playwright/test";
import path from "path";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        launchOptions: {
          args: [
            `--disable-extensions-except=${path.resolve("output/chrome-mv3")}`,
            `--load-extension=${path.resolve("output/chrome-mv3")}`,
          ],
        },
      },
    },
    {
      name: "firefox",
      use: { browserName: "firefox" },
    },
    {
      name: "webkit",
      use: { browserName: "webkit" },
    },
  ],
});
```

#### 3.2 Create test fixture page

```html
<!-- tests/e2e/fixtures/test-page.html -->
<!DOCTYPE html>
<html>
  <head>
    <title>Test Page</title>
  </head>
  <body>
    <turbo-frame id="main-frame" src="/main">
      <turbo-frame id="nested-frame">
        <div data-controller="modal dropdown">Modal content</div>
      </turbo-frame>
    </turbo-frame>
    <div data-controller="sidebar">Sidebar</div>
  </body>
</html>
```

#### 3.3 Create E2E tests

```js
// tests/e2e/extension.spec.js
import { test, expect } from "@playwright/test";

test.describe("Extension Panel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("file://" + __dirname + "/fixtures/test-page.html");
  });

  test("scans and displays turbo-frames", async ({ page }) => {
    // Open DevTools panel, assert tree contains expected frames
  });

  test("scans and displays Stimulus controllers", async ({ page }) => {
    // Assert controllers appear in tree with badges
  });

  test("highlights element on hover", async ({ page }) => {
    // Hover on tree node, assert page element has outline style
  });

  test("removes highlight on mouse leave", async ({ page }) => {
    // Hover then leave, assert outline removed
  });

  test("clicking element reveals in Elements tab", async ({ page }) => {
    // Click tree node, assert DevTools switches to Elements tab
  });

  test("refresh button rescans DOM", async ({ page }) => {
    // Add new frame dynamically, click refresh, assert new frame appears
  });

  test("displays correct count in toolbar", async ({ page }) => {
    // Assert "2 frames, 2 controllers" text
  });

  test("handles empty page gracefully", async ({ page }) => {
    await page.goto("about:blank");
    // Assert empty state message
  });

  test("handles deeply nested elements (5+ levels)", async ({ page }) => {
    // Load fixture with deep nesting, assert all levels render
  });
});

test.describe("Cross-browser", () => {
  test("works in Firefox", async ({ page, browserName }) => {
    test.skip(browserName !== "firefox");
  });

  test("works in Safari/WebKit", async ({ page, browserName }) => {
    test.skip(browserName !== "webkit");
  });
});
```

---

### Phase 4: Implementation

#### 4.1 Create DevTools entry

```js
// entrypoints/devtools.js
export default defineUnlistedScript(() => {
  chrome.devtools.panels.create(
    "Turbo Frames",
    "/icon.png",
    "/panel/index.html",
  );
});
```

#### 4.2 Create content script

```js
// entrypoints/content.js
export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    // DOM scanning logic
    // Track elements with WeakMap/Map, never by mutating the target DOM
    // Message handling for highlight/unhighlight
  },
});
```

#### 4.3 Create panel UI and logic

**Requirement:** The extension must never modify the target page DOM structure or attributes for tracking purposes.

**Element identity strategy:**

- Use a `WeakMap<Element, string>` to assign ephemeral inspector keys in memory
- Use a reverse `Map<string, Element>` to look elements up from panel messages
- Rebuild or refresh the reverse lookup map during each scan
- Use real element `id` values when present; otherwise generate inspector-only keys in memory
- Do not add `id`, `data-*`, or any other tracking attributes to the inspected page DOM

---

### Phase 5: Browser-Specific Builds

#### 5.1 Build commands

```bash
npm run build              # Chrome (default)
npm run build:firefox      # Firefox
npm run build:safari       # Safari (requires Xcode)
```

#### 5.2 Safari conversion

```bash
xcrun safari-web-extension-converter output/safari-mv3 --project-location ./safari-project
```

---

## Testing Strategy

### Unit Tests (Vitest)

| Test File              | Coverage                           |
| ---------------------- | ---------------------------------- |
| `tree-builder.test.js` | buildTree function, all edge cases |

**Run:** `npm test` or `npm run test:ui` for interactive mode

**Why Vitest?**

- Native Vite integration (same config)
- Fast, parallel test execution
- Compatible with Jest API
- Built-in UI for debugging

### E2E Tests (Playwright)

| Category           | Tests                                         |
| ------------------ | --------------------------------------------- |
| Core functionality | Scan frames, scan controllers, tree rendering |
| Interactions       | Hover highlight, click to inspect, refresh    |
| Edge cases         | Empty page, deep nesting, dynamic content     |
| Cross-browser      | Chrome, Firefox, Safari/WebKit                |

**Run:** `npm run test:e2e` or `npm run test:e2e:headed`

### Manual Testing Checklist

- [ ] Extension loads in Chrome DevTools
- [ ] Extension loads in Firefox DevTools
- [ ] Extension loads in Safari DevTools
- [ ] Tree renders correctly with nested frames
- [ ] Controllers display with correct badges
- [ ] Hover highlights element on page
- [ ] Click reveals element in Elements tab
- [ ] Refresh button updates tree
- [ ] Count shows correct numbers

---

## Learnings from Prototype

### What Worked Well

1. **Pure function for tree-building** – Easy to test, no DOM dependencies
2. **Message-based communication** – Clean separation between panel and content script
3. **In-memory element identity** – `WeakMap<Element, string>` plus reverse lookup `Map`
4. **CSS custom properties** – Easy theming with VS Code colors

### Issues Encountered & Solutions

| Issue                                                         | Solution                                           |
| ------------------------------------------------------------- | -------------------------------------------------- |
| DevTools panels can't load CDN scripts (CSP)                  | Use local CSS, no external dependencies            |
| Can't inspect panel UI in DevTools                            | Create standalone test page with mocked Chrome API |
| `chrome.devtools.inspectedWindow.eval()` needed for inspect() | Use eval to call inspect() in page context         |
| Elements without IDs need tracking                            | Use `WeakMap<Element, string>` with reverse lookup |

### Architecture Decisions

1. **Scan both turbo-frames and data-controller elements** – Single pass with `querySelectorAll('turbo-frame, [data-controller]')`
2. **Flat array → tree structure** – Content script sends flat data, panel builds tree
3. **tagName field identifies element type** – `tagName: 'turbo-frame'` or `tagName: 'div'` (or other element tag)
4. **Controllers array on frames** – Frames can have attached controllers

### Code Patterns to Reuse

```js
// Element key tracking without mutating the page DOM
const elementKeys = new WeakMap();
const elementsByKey = new Map();

function getElementKey(element) {
  if (element.id) {
    elementsByKey.set(element.id, element);
    return element.id;
  }

  const existingKey = elementKeys.get(element);
  if (existingKey) {
    elementsByKey.set(existingKey, element);
    return existingKey;
  }

  const key = `hotwire-inspector-${crypto.randomUUID()}`;
  elementKeys.set(element, key);
  elementsByKey.set(key, element);
  return key;
}

function findElementByKey(key) {
  return elementsByKey.get(key) || document.getElementById(key);
}

// Highlight with outline
function highlightElement(key) {
  const el = findElementByKey(key);
  if (el) {
    el.style.outline = "3px dashed #2563eb";
    el.style.outlineOffset = "2px";
  }
}

// Reveal in Elements tab
function inspectElement(id) {
  const escapedId = id.replace(/"/g, '\\"');
  const code = `inspect(document.getElementById("${escapedId}"))`;
  chrome.devtools.inspectedWindow.eval(code);
}
```

---

## Feature: Turbo Frame Tree View

**Displays:**

- All `<turbo-frame>` elements on the page
- Nested hierarchy matching DOM structure
- Frame `id` attribute
- Frame `src` attribute (if present)

**Interactions:**

- **Refresh button** – Re-scan the DOM
- **Hover** – Highlight element on page with blue outline
- **Click** – Reveal element in Elements tab

**Tree rendering:**

```
▼ main-content [frame]
    ▼ sidebar [frame]
        └ notifications [frame]
    └ feed [frame]
```

---

## Feature: Stimulus Controller Detection

**Displays:**

- Elements with `data-controller` attribute
- Controller names as badges
- Mixed hierarchy with frames

**Data model:**

```js
{ id, src, parentId, tagName: 'turbo-frame' }
{ id, controllers: ['modal', 'dropdown'], parentId, tagName: 'div' }
{ id, src, parentId, tagName: 'turbo-frame', controllers: ['lazy'] } // frame with controllers
```

**Tree rendering:**

```
▼ main-content [frame]
    ◆ modal, dropdown [controllers]
    ▼ sidebar [frame]
        ◆ tabs [controller]
```

---

## Development Workflow

```bash
# Start dev server with hot reload
npm run dev

# Run unit tests in watch mode
npm test

# Run E2E tests
npm run test:e2e

# Build for production
npm run build

# Package for distribution
npm run zip
```
