# Start Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the NewTab bookmark extension into a Bonjourr-style start page (photo, clock, greeting, search, top sites) with the existing bookmark manager in a pull-up bottom sheet over the same blurred photo.

**Architecture:** No build step. `newtab.html` loads four stylesheets and one `<script type="module" src="js/main.js">`. Pure logic lives in `js/lib/` (no DOM, no browser APIs) and is unit-tested with Node's built-in test runner. DOM modules each own one part of the page and read settings from a single `settings-store`. The existing manager code is first moved, unchanged in behaviour, into modules; new features are layered on afterwards. One refinement of the spec's file list: the spec's single `js/start.js` is split into `clock.js`, `start-search.js`, `top-sites-row.js` and `shortcuts.js`, and the photo section of the settings panel lives in `settings-photos.js`, so that each file keeps one job.

**Tech Stack:** Plain HTML/CSS/ES modules, WebExtension APIs (`bookmarks`, `storage`, `topSites`, `search`, Chrome `_favicon`), IndexedDB, `node:test` (Node 24), Playwright MCP for browser checks, Python `http.server` for serving the page locally.

**Spec:** `docs/superpowers/specs/2026-10-14-start-page-redesign-design.md`

## Global Constraints

- No build step and no runtime dependencies; "Load unpacked" must keep working from the repo folder.
- No network requests from the page. Nothing leaves the machine.
- Chrome (MV3) and Firefox 128+ (`strict_min_version: "128.0"`) both supported.
- MV3 forbids inline scripts: all JS in files, no `onclick=` attributes.
- Existing storage keys keep their names and formats: `custom_theme_css`, `view_mode`, `collapsed_folders`, `last_folder_id`, `note_*`.
- New storage keys: `settings` (one object), `background_state` (`{ id, pickedAt }`). IndexedDB database `newtab-images`, store `photos`: `{ id, blob, thumb, addedAt }`.
- Existing element IDs and classes used by custom CSS keep their names (`#bookmark-list`, `.bookmark-item`, `#search-input`, `#css-editor`, `#settings-panel`, etc.).
- New permissions: `topSites`, `search`, `favicon`. Manifest version `2.0.0`.
- Code style: match `newtab.js` — 2-space indent, double quotes, semicolons, `camelCase`, `UPPER_SNAKE` constants, `console.error` + toast on failures, user-facing copy uses curly quotes “ ”.
- Every commit message ends with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A single dotted word typed into the start search (`node.js`, `readme.md`) runs a web search; it must not navigate to `https://node.js`. A leading `?` always forces a search. → Task 7, `test/lib/url.test.js`.
2. Trackpad momentum that keeps scrolling up after the manager reaches its top must not close the sheet; closing needs a fresh upward flick. → Task 9, `test/lib/wheel.test.js`.
3. Keys typed into a note, the filter box, the start search, the settings name field or the CSS editor (`/`, `↓`) type normally and never open the sheet or move focus. → Task 9, Step 9 browser check.
4. A batch upload containing unusable files (a `.txt`, an undecodable image) skips each bad file with a toast naming it while the good files still add; huge images are downscaled. → Task 11, `test/lib/image-size.test.js` and Step 8 browser check.
5. Top sites with duplicates, non-web URLs (`chrome://newtab/`, `file:///…`, `about:blank`) or an empty list show only unique http(s) sites, and the row hides when nothing is left. → Task 8, `test/lib/top-sites.test.js`.

---

## How to run things

**Unit tests:** `npm test` (runs `node --test "test/**/*.test.js"`; nothing to install).

**Serve the page for browser checks** (background process, leave it running across tasks):

```bash
cd /c/dev/Homepage && python -m http.server 8765 --bind 127.0.0.1
```

**Open the page with the stubbed browser APIs** using the Playwright MCP tool `browser_run_code_unsafe` with:

```js
async (page) => {
  await page.addInitScript({ path: "C:/dev/Homepage/test/browser/chrome-stub.js" });
  await page.goto("http://127.0.0.1:8765/newtab.html");
}
```

The stub registers once per Playwright page; later checks in the same session can just reload (`browser_navigate` to the same URL). The stub keeps storage in memory, so a reload resets it. Screenshots must be saved under `C:/dev/Homepage/.playwright-mcp/` (the only writable location for the MCP), which is git-ignored.

---

### Task 1: Test harness and browser stub

**Files:**
- Create: `package.json`
- Create: `test/harness.test.js`
- Create: `test/browser/chrome-stub.js`

**Interfaces:**
- Produces: `npm test`; `test/browser/chrome-stub.js` defining `globalThis.chrome` with `bookmarks`, `storage.local`, `storage.onChanged`, `topSites.get`, `search.query`, `runtime.getURL`, `runtime.getManifest`; `window.__stub = { data, searches, topSites }` for inspection.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "newtab",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test \"test/**/*.test.js\""
  }
}
```

- [ ] **Step 2: Create `test/harness.test.js`** (proves the runner works; removed in Task 2)

```js
import { test } from "node:test";
import assert from "node:assert/strict";

test("test runner works", () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: `# pass 1`, `# fail 0`.

- [ ] **Step 4: Create `test/browser/chrome-stub.js`**

```js
// Stand-in for the WebExtension APIs so newtab.html can run on a plain
// http:// page in Playwright. Injected with page.addInitScript before any
// page script runs. Everything lives in memory and resets on reload.
(() => {
  const createEvent = () => {
    const listeners = new Set();
    return {
      addListener: (listener) => listeners.add(listener),
      removeListener: (listener) => listeners.delete(listener),
      hasListener: (listener) => listeners.has(listener),
      emit: (...args) => listeners.forEach((listener) => listener(...args))
    };
  };
  const clone = (value) => (value === undefined ? undefined : structuredClone(value));

  let nextId = 100;
  const tree = {
    id: "0", title: "", children: [
      { id: "1", parentId: "0", title: "Bookmarks bar", children: [
        { id: "10", parentId: "1", title: "GitHub", url: "https://github.com/" },
        { id: "11", parentId: "1", title: "MDN Web Docs", url: "https://developer.mozilla.org/" },
        { id: "12", parentId: "1", title: "Work", children: [
          { id: "13", parentId: "12", title: "Jira", url: "https://jira.example.com/" }
        ] }
      ] },
      { id: "2", parentId: "0", title: "Other bookmarks", children: [
        { id: "20", parentId: "2", title: "Hacker News", url: "https://news.ycombinator.com/" }
      ] }
    ]
  };

  const find = (id, node = tree) => {
    if (node.id === id) {
      return node;
    }
    for (const child of node.children || []) {
      const found = find(id, child);
      if (found) {
        return found;
      }
    }
    return null;
  };
  const detach = (node) => {
    const parent = find(node.parentId);
    parent.children = parent.children.filter((child) => child.id !== node.id);
  };

  const bookmarkEvents = {
    onCreated: createEvent(),
    onRemoved: createEvent(),
    onChanged: createEvent(),
    onMoved: createEvent()
  };

  const bookmarks = {
    ...bookmarkEvents,
    getTree: async () => [clone(tree)],
    create: async ({ parentId, title, url }) => {
      const node = { id: String(nextId++), parentId, title: title || "", ...(url ? { url } : { children: [] }) };
      find(parentId).children.push(node);
      bookmarkEvents.onCreated.emit(node.id, clone(node));
      return clone(node);
    },
    update: async (id, changes) => {
      const node = find(id);
      Object.assign(node, changes);
      bookmarkEvents.onChanged.emit(id, changes);
      return clone(node);
    },
    move: async (id, { parentId }) => {
      const node = find(id);
      detach(node);
      node.parentId = parentId;
      find(parentId).children.push(node);
      bookmarkEvents.onMoved.emit(id, { parentId });
      return clone(node);
    },
    remove: async (id) => {
      detach(find(id));
      bookmarkEvents.onRemoved.emit(id, {});
    },
    removeTree: async (id) => {
      detach(find(id));
      bookmarkEvents.onRemoved.emit(id, {});
    }
  };

  const data = {};
  const onChanged = createEvent();
  const keyList = (keys) => {
    if (keys == null) {
      return Object.keys(data);
    }
    if (typeof keys === "string") {
      return [keys];
    }
    return Array.isArray(keys) ? keys : Object.keys(keys);
  };

  const local = {
    get: async (keys) => Object.fromEntries(keyList(keys).filter((key) => key in data).map((key) => [key, clone(data[key])])),
    set: async (items) => {
      const changes = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = { oldValue: clone(data[key]), newValue: clone(value) };
        data[key] = clone(value);
      }
      onChanged.emit(changes, "local");
    },
    remove: async (keys) => {
      const changes = {};
      for (const key of [].concat(keys)) {
        if (key in data) {
          changes[key] = { oldValue: data[key] };
          delete data[key];
        }
      }
      onChanged.emit(changes, "local");
    }
  };

  window.__stub = {
    data,
    searches: [],
    topSites: [
      { url: "https://github.com/", title: "GitHub" },
      { url: "https://www.youtube.com/", title: "YouTube" },
      { url: "chrome://newtab/", title: "New Tab" },
      { url: "https://news.ycombinator.com/", title: "Hacker News" },
      { url: "https://github.com/", title: "GitHub (duplicate)" },
      { url: "https://mail.google.com/mail/u/0/", title: "Inbox" },
      { url: "https://developer.mozilla.org/", title: "MDN" },
      { url: "https://www.wikipedia.org/", title: "Wikipedia" },
      { url: "https://calendar.google.com/", title: "Calendar" },
      { url: "https://www.reddit.com/", title: "" },
      { url: "https://example.com/", title: "Example" }
    ]
  };

  globalThis.chrome = {
    bookmarks,
    storage: { local, onChanged },
    topSites: { get: async () => clone(window.__stub.topSites) },
    search: {
      query: async (options) => {
        window.__stub.searches.push(options);
      }
    },
    runtime: {
      id: "stub",
      getURL: (path) => `chrome-extension://stub/${path.replace(/^\//, "")}`,
      getManifest: () => ({ version: "test" })
    }
  };
})();
```

- [ ] **Step 5: Baseline browser check of the current page**

Start the server (see "How to run things"), open the page with the stub, and take two screenshots: `.playwright-mcp/baseline-grid.png` (default view) and, after clicking the **List** toggle, `.playwright-mcp/baseline-list.png`. Expected: 5 bookmark cards in grid view; the folder tree in list view with "Bookmarks bar", "Work" and "Other bookmarks". These screenshots are the reference for Tasks 2 and 3.

- [ ] **Step 6: Commit**

```bash
git add package.json test/harness.test.js test/browser/chrome-stub.js
git commit -m "Add test runner and browser API stub

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Split `newtab.js` into ES modules (no behaviour change)

**Files:**
- Create: `js/api.js`, `js/ui.js`, `js/custom-css.js`, `js/manager.js`, `js/main.js`, `js/lib/url.js`, `js/lib/match.js`
- Create: `test/lib/url.test.js`, `test/lib/match.test.js`
- Modify: `newtab.html:1213` (script tag)
- Delete: `newtab.js`, `test/harness.test.js`

Line numbers below refer to `newtab.js` at commit `3ae2f54`. Move code verbatim unless an edit is listed. ES modules are strict by default, so drop `"use strict"`.

**Interfaces:**
- Produces:
  - `js/api.js`: `export const api`; `export const isChromium` (boolean).
  - `js/ui.js`: `export { $, createElement, createIcon, createIconSlot, hydrateIcons, createIconButton, hashHue, hostOf, formatUrlForDisplay, avatarLetter, plural, errorMessage, showToast, confirmAction, isTypingTarget }`.
  - `js/lib/url.js`: `export function normalizeUrl(input: string): string` (throws `Error` with user-facing message).
  - `js/lib/match.js`: `export function bookmarkMatches(bookmark: {id,title,url}, query: string /* lowercased */, notes: Record<string,string>): boolean`.
  - `js/custom-css.js`: `export const CSS_STORAGE_KEY`; `export function applyCustomCss(cssText)`; `export function initCssEditor(initialCss)`; `export function handleCssStorageChange(changes, areaName)`.
  - `js/manager.js`: `export const MANAGER_STORAGE_KEYS: string[]`; `export async function initManager(stored: object)`.

- [ ] **Step 1: Write failing tests for the pure modules**

`test/lib/url.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl } from "../../js/lib/url.js";

test("normalizeUrl adds https:// when no scheme is given", () => {
  assert.equal(normalizeUrl("example.com"), "https://example.com/");
});

test("normalizeUrl keeps an existing scheme", () => {
  assert.equal(normalizeUrl("http://example.com/a"), "http://example.com/a");
  assert.equal(normalizeUrl("mailto:me@example.com"), "mailto:me@example.com");
});

test("normalizeUrl trims whitespace", () => {
  assert.equal(normalizeUrl("  example.com  "), "https://example.com/");
});

test("normalizeUrl rejects empty input", () => {
  assert.throws(() => normalizeUrl("   "), /Enter a URL/);
});

test("normalizeUrl rejects unsupported schemes", () => {
  assert.throws(() => normalizeUrl("javascript://alert(1)"), /Only http, https, ftp and mailto/);
});
```

`test/lib/match.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { bookmarkMatches } from "../../js/lib/match.js";

const bookmark = { id: "7", title: "GitHub Home", url: "https://github.com/" };

test("matches on title, case-insensitively via lowercased query", () => {
  assert.equal(bookmarkMatches(bookmark, "home", {}), true);
});

test("matches on URL", () => {
  assert.equal(bookmarkMatches(bookmark, "github.com", {}), true);
});

test("matches on the bookmark's note", () => {
  assert.equal(bookmarkMatches(bookmark, "code review", { 7: "For Code Review links" }), true);
});

test("no match returns false, and a missing note is fine", () => {
  assert.equal(bookmarkMatches(bookmark, "gitlab", {}), false);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module '.../js/lib/url.js'` (and `match.js`).

- [ ] **Step 3: Create `js/lib/url.js` and `js/lib/match.js`**

`js/lib/url.js` — move `normalizeUrl` (lines 162–178) and prefix it with `export`.

`js/lib/match.js`:

```js
// True when the bookmark's title, URL or note contains `query`.
// `query` must already be lowercased.
export function bookmarkMatches(bookmark, query, notes) {
  return (
    bookmark.title.toLowerCase().includes(query) ||
    bookmark.url.toLowerCase().includes(query) ||
    (notes[bookmark.id] || "").toLowerCase().includes(query)
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all url and match tests PASS.

- [ ] **Step 5: Create `js/api.js`**

```js
// Firefox exposes the promise-based `browser` namespace; Chrome uses `chrome`
// (which also returns promises in Manifest V3).
export const api = globalThis.browser ?? globalThis.chrome;

// Chromium-only features (such as the built-in favicon service) key off this.
export const isChromium = api.runtime.getURL("").startsWith("chrome-extension://");
```

- [ ] **Step 6: Create `js/ui.js`**

Contents, in this order:
1. `const TOAST_DURATION_MS = 3200;` (from line 16).
2. Lines 28–43 (`SVG_NS`, `FOLDER_PATH`, `ICON_PATHS`). Add two entries to `ICON_PATHS`: `x: "M6 6l12 12M18 6L6 18",` and `skip: "M5 5l9 7-9 7zM18 5v14",`.
3. Lines 67–160 (`$` through `errorMessage`).
4. Lines 184–203 (`showToast`, `confirmAction`).
5. New helper (the same test that lines 372–373 used inline):

```js
// True when a key press is going into a text field and shouldn't trigger shortcuts.
function isTypingTarget(target) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable]"));
}
```

6. At the end:

```js
export {
  $, createElement, createIcon, createIconSlot, hydrateIcons, createIconButton,
  hashHue, hostOf, formatUrlForDisplay, avatarLetter, plural, errorMessage,
  showToast, confirmAction, isTypingTarget
};
```

- [ ] **Step 7: Create `js/custom-css.js`**

```js
import { api } from "./api.js";
import { $, confirmAction } from "./ui.js";

export const CSS_STORAGE_KEY = "custom_theme_css";
const CUSTOM_STYLE_ELEMENT_ID = "custom-theme-style";
const STATUS_CLEAR_DELAY_MS = 2500;

let settingsStatusTimer = null;
```

Then move, verbatim: `applyCustomCss` (lines 209–228, add `export`), `saveCustomCss` (230–238), `showSettingsStatus` (240–247).

Then add `initCssEditor`, built from `initSettingsPanel` (lines 249–317) **without** the panel/button toggle (drop lines 250–251 and 256–266):

```js
export function initCssEditor(initialCss) {
  const editor = $("css-editor");
  editor.value = initialCss;

  // ...lines 268–316 verbatim (handleSave, save/reset buttons, editor keydown)...
}
```

Then the CSS half of the old storage listener (lines 1195–1208):

```js
export function handleCssStorageChange(changes, areaName) {
  if (areaName !== "local" || !changes[CSS_STORAGE_KEY]) {
    return;
  }
  const newValue = typeof changes[CSS_STORAGE_KEY].newValue === "string" ? changes[CSS_STORAGE_KEY].newValue : "";
  applyCustomCss(newValue);
  const editor = $("css-editor");
  if (document.activeElement !== editor) {
    editor.value = newValue;
  }
}
```

- [ ] **Step 8: Create `js/manager.js`**

Header:

```js
import { api } from "./api.js";
import {
  $, createElement, createIcon, createIconSlot, createIconButton, hashHue, hostOf,
  formatUrlForDisplay, avatarLetter, plural, errorMessage, showToast, confirmAction
} from "./ui.js";
import { normalizeUrl } from "./lib/url.js";
import { bookmarkMatches } from "./lib/match.js";
```

Then move, verbatim, in order:
- Constants lines 8–13 and 17–26 (`VIEW_STORAGE_KEY` … `TYPE_FOLDER`; skip `CSS_STORAGE_KEY`, `CUSTOM_STYLE_ELEMENT_ID`, `STATUS_CLEAR_DELAY_MS`, `TOAST_DURATION_MS`).
- State lines 45–61, minus `let settingsStatusTimer = null;` (line 57).
- Lines 323–1189 (view toggle through `renderBookmarks`), minus `bookmarkMatches` (lines 509–515), which now comes from `lib/match.js`.
- Lines 1221–1231 (`initBookmarkListeners`).

Edits:
- Line 523: `if (bookmarkMatches(node, query, state.notes)) {`
- Line 1168: `.filter((bookmark) => !query || bookmarkMatches(bookmark, query, state.notes));`
- Add the notes half of the old storage listener:

```js
function handleNoteStorageChange(changes, areaName) {
  if (areaName !== "local") {
    return;
  }
  for (const [key, change] of Object.entries(changes)) {
    if (!key.startsWith(NOTE_KEY_PREFIX)) {
      continue;
    }
    const newValue = typeof change.newValue === "string" ? change.newValue : "";
    const bookmarkId = key.slice(NOTE_KEY_PREFIX.length);
    const card = document.querySelector(`.bookmark-item[data-bookmark-id="${CSS.escape(bookmarkId)}"]`);
    const textarea = card ? card.querySelector(".bookmark-note") : null;
    if (textarea && document.activeElement !== textarea && textarea.value !== newValue) {
      textarea.value = newValue;
      state.notes[bookmarkId] = newValue;
    }
  }
}
```

- Add the exported entry points (from `init`, lines 1250–1263):

```js
export const MANAGER_STORAGE_KEYS = [VIEW_STORAGE_KEY, COLLAPSED_STORAGE_KEY, LAST_FOLDER_STORAGE_KEY];

export async function initManager(stored) {
  state.view = VIEW_MODES.includes(stored[VIEW_STORAGE_KEY]) ? stored[VIEW_STORAGE_KEY] : VIEW_GRID;
  state.collapsed = new Set(Array.isArray(stored[COLLAPSED_STORAGE_KEY]) ? stored[COLLAPSED_STORAGE_KEY] : []);
  state.lastFolderId = typeof stored[LAST_FOLDER_STORAGE_KEY] === "string" ? stored[LAST_FOLDER_STORAGE_KEY] : null;

  initViewToggle();
  initSearch();
  initToolbar();
  initDialogs();
  initDragContainer();
  api.storage.onChanged.addListener(handleNoteStorageChange);
  initBookmarkListeners();

  await refresh();
}
```

- [ ] **Step 9: Create `js/main.js`**

```js
import { api } from "./api.js";
import { $, hydrateIcons } from "./ui.js";
import { CSS_STORAGE_KEY, applyCustomCss, initCssEditor, handleCssStorageChange } from "./custom-css.js";
import { MANAGER_STORAGE_KEYS, initManager } from "./manager.js";

// Temporary: the old <details> settings panel. Replaced in the settings-panel task.
function initLegacySettingsToggle() {
  const panel = $("settings-panel");
  const settingsButton = $("settings-btn");
  const editor = $("css-editor");

  settingsButton.addEventListener("click", () => {
    panel.open = !panel.open;
    if (panel.open) {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
      editor.focus({ preventScroll: true });
    }
  });

  panel.addEventListener("toggle", () => {
    settingsButton.setAttribute("aria-expanded", String(panel.open));
  });
}

async function init() {
  hydrateIcons(document);

  // Apply the theme and view first so bookmarks render already styled.
  let stored = {};
  try {
    stored = await api.storage.local.get([CSS_STORAGE_KEY, ...MANAGER_STORAGE_KEYS]);
  } catch (error) {
    console.error("Failed to load settings:", error);
  }

  const initialCss = typeof stored[CSS_STORAGE_KEY] === "string" ? stored[CSS_STORAGE_KEY] : "";
  applyCustomCss(initialCss);
  initCssEditor(initialCss);
  initLegacySettingsToggle();
  api.storage.onChanged.addListener(handleCssStorageChange);

  await initManager(stored);
}

init();
```

- [ ] **Step 10: Switch the page to the module and remove old files**

In `newtab.html`, replace `<script src="newtab.js"></script>` with `<script type="module" src="js/main.js"></script>`. Then:

```bash
git rm -q newtab.js test/harness.test.js
```

- [ ] **Step 11: Check for leftovers**

Run: `grep -rn "settingsStatusTimer\|TOAST_DURATION_MS\|bookmarkMatches(" js/`
Expected: `settingsStatusTimer` only in `custom-css.js`, `TOAST_DURATION_MS` only in `ui.js`, and every `bookmarkMatches(` call in `manager.js` passes three arguments.

- [ ] **Step 12: Run unit tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 13: Browser regression check**

Reload the page with the stub. Check that the browser console has no errors (`browser_console_messages`). Then, in order:
1. Grid view matches `baseline-grid.png`.
2. Type `hub` in the search box: one card (GitHub), and the count reads "1 of 5 bookmarks".
3. Press `/` with focus on the page body: the search box gets focus.
4. Add a bookmark `example.org` with **Add bookmark**: the toast "Added “https://example.org/”" appears and the card shows.
5. Type a note on a card, wait 1 s: "Saved" appears; `window.__stub.data` has a `note_<id>` key.
6. Switch to **List**: the result matches `baseline-list.png` (plus the new bookmark).
7. Open Settings, type `:root{--accent:#e11d48}` and press Ctrl+S: "Style saved." appears and the primary button turns red.

- [ ] **Step 14: Commit**

```bash
git add -A js test newtab.html
git commit -m "Split newtab.js into ES modules without changing behaviour

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Move the inline CSS into stylesheets (no behaviour change)

**Files:**
- Create: `css/base.css`, `css/sheet.css`, `css/settings.css`
- Modify: `newtab.html:46-1102` (the `<style>` block)

**Interfaces:**
- Produces: `css/base.css` (tokens, reset, icons, buttons, dialogs, toasts, reduced motion), `css/sheet.css` (header, view toggle, bookmark list and cards, empty state, responsive), `css/settings.css` (settings panel). Later tasks append to these files and add `css/start.css`.

Line numbers refer to `newtab.html` at commit `3ae2f54` (the `<style>` opens on line 46 and closes on line 1102).

- [ ] **Step 1: Extract the CSS blocks**

```bash
cd /c/dev/Homepage && mkdir -p css
{ sed -n '47,168p' newtab.html; echo; sed -n '285,372p' newtab.html; echo; sed -n '905,1040p' newtab.html; echo; sed -n '1094,1101p' newtab.html; } | sed 's/^    //' > css/base.css
{ sed -n '170,283p' newtab.html; echo; sed -n '374,808p' newtab.html; echo; sed -n '1042,1092p' newtab.html; } | sed 's/^    //' > css/sheet.css
sed -n '810,903p' newtab.html | sed 's/^    //' > css/settings.css
```

- [ ] **Step 2: Check that the split is complete**

Run:

```bash
cd /c/dev/Homepage && cat css/base.css css/sheet.css css/settings.css | grep -c '{' ; sed -n '47,1101p' newtab.html | grep -c '{'
```

Expected: the two counts are equal.

- [ ] **Step 3: Replace the `<style>` block with links**

In `newtab.html`, delete lines 46–1102 (`<style>` through `</style>`) and put these lines in their place, after the selector-reference comment:

```html
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/sheet.css">
  <link rel="stylesheet" href="css/settings.css">
```

The custom-CSS `<style>` is still appended at the end of `<head>` by `applyCustomCss`, so it still loads last.

- [ ] **Step 4: Browser regression check**

Reload with the stub. Grid and list screenshots match the Task 1 baselines. Open Settings: it looks as before. Run `browser_emulate_media` with `colorScheme: "dark"` and take a screenshot: the dark theme applies.

- [ ] **Step 5: Commit**

```bash
git add css newtab.html
git commit -m "Move inline styles into stylesheets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Settings schema and store

**Files:**
- Create: `js/lib/settings-schema.js`, `js/settings-store.js`
- Test: `test/lib/settings-schema.test.js`

**Interfaces:**
- Produces:
  - `js/lib/settings-schema.js`: `export const PHOTO_FREQUENCIES = ["every-tab", "hourly", "daily"]`, `export const TIME_FORMATS = ["auto", "12h", "24h"]`, `export const DARKEN_MAX = 60`, `export const TOP_SITES_MAX = 12`, `export const NAME_MAX_LENGTH = 40`, `export const DEFAULTS` (frozen), `export function mergeSettings(stored: unknown): Settings`.
  - `Settings` = `{ bundledPhotos: boolean, photoFrequency: "every-tab"|"hourly"|"daily", darken: 0..60 int, showClock: boolean, showDate: boolean, showGreeting: boolean, timeFormat: "auto"|"12h"|"24h", name: string, showSearch: boolean, searchSuggestions: boolean, topSitesCount: 0..12 int, hiddenTopSites: string[], openSheetOnStart: boolean }`.
  - `js/settings-store.js`: `export async function loadSettings(): Promise<Settings>`, `export function getSettings(): Settings`, `export async function updateSettings(patch: Partial<Settings>)`, `export function subscribe(listener: (settings) => void): () => void`.

- [ ] **Step 1: Write the failing test**

`test/lib/settings-schema.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, mergeSettings } from "../../js/lib/settings-schema.js";

test("defaults match the spec", () => {
  assert.deepEqual({ ...DEFAULTS, hiddenTopSites: [...DEFAULTS.hiddenTopSites] }, {
    bundledPhotos: true,
    photoFrequency: "daily",
    darken: 25,
    showClock: true,
    showDate: true,
    showGreeting: true,
    timeFormat: "auto",
    name: "",
    showSearch: true,
    searchSuggestions: true,
    topSitesCount: 8,
    hiddenTopSites: [],
    openSheetOnStart: false
  });
});

test("missing or non-object input gives the defaults", () => {
  for (const input of [undefined, null, "x", 3, []]) {
    assert.deepEqual(mergeSettings(input), mergeSettings({}));
    assert.equal(mergeSettings(input).topSitesCount, 8);
  }
});

test("valid stored values win over defaults", () => {
  const merged = mergeSettings({ name: "Jon", topSitesCount: 0, photoFrequency: "hourly", darken: 60, hiddenTopSites: ["https://a.com/"] });
  assert.equal(merged.name, "Jon");
  assert.equal(merged.topSitesCount, 0);
  assert.equal(merged.photoFrequency, "hourly");
  assert.equal(merged.darken, 60);
  assert.deepEqual(merged.hiddenTopSites, ["https://a.com/"]);
});

test("invalid values fall back per key, others are kept", () => {
  const merged = mergeSettings({
    name: "Jon",
    topSitesCount: "8",
    darken: 61,
    timeFormat: "36h",
    showClock: "yes",
    hiddenTopSites: ["ok", 5]
  });
  assert.equal(merged.name, "Jon");
  assert.equal(merged.topSitesCount, 8);
  assert.equal(merged.darken, 25);
  assert.equal(merged.timeFormat, "auto");
  assert.equal(merged.showClock, true);
  assert.deepEqual(merged.hiddenTopSites, []);
});

test("non-integer numbers and over-long names are rejected", () => {
  const merged = mergeSettings({ topSitesCount: 2.5, darken: -1, name: "x".repeat(41) });
  assert.equal(merged.topSitesCount, 8);
  assert.equal(merged.darken, 25);
  assert.equal(merged.name, "");
});

test("unknown keys are dropped", () => {
  assert.equal("weather" in mergeSettings({ weather: true }), false);
});

test("result does not share arrays with the input or defaults", () => {
  const stored = { hiddenTopSites: ["https://a.com/"] };
  const merged = mergeSettings(stored);
  merged.hiddenTopSites.push("https://b.com/");
  assert.deepEqual(stored.hiddenTopSites, ["https://a.com/"]);
  assert.deepEqual(DEFAULTS.hiddenTopSites, []);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../settings-schema.js'`.

- [ ] **Step 3: Implement `js/lib/settings-schema.js`**

```js
export const PHOTO_FREQUENCIES = ["every-tab", "hourly", "daily"];
export const TIME_FORMATS = ["auto", "12h", "24h"];
export const DARKEN_MAX = 60;
export const TOP_SITES_MAX = 12;
export const NAME_MAX_LENGTH = 40;

export const DEFAULTS = Object.freeze({
  bundledPhotos: true,
  photoFrequency: "daily",
  darken: 25,
  showClock: true,
  showDate: true,
  showGreeting: true,
  timeFormat: "auto",
  name: "",
  showSearch: true,
  searchSuggestions: true,
  topSitesCount: 8,
  hiddenTopSites: Object.freeze([]),
  openSheetOnStart: false
});

const isBoolean = (value) => typeof value === "boolean";
const isIntegerIn = (min, max) => (value) => Number.isInteger(value) && value >= min && value <= max;
const isOneOf = (list) => (value) => list.includes(value);

const VALIDATORS = {
  bundledPhotos: isBoolean,
  photoFrequency: isOneOf(PHOTO_FREQUENCIES),
  darken: isIntegerIn(0, DARKEN_MAX),
  showClock: isBoolean,
  showDate: isBoolean,
  showGreeting: isBoolean,
  timeFormat: isOneOf(TIME_FORMATS),
  name: (value) => typeof value === "string" && value.length <= NAME_MAX_LENGTH,
  showSearch: isBoolean,
  searchSuggestions: isBoolean,
  topSitesCount: isIntegerIn(0, TOP_SITES_MAX),
  hiddenTopSites: (value) => Array.isArray(value) && value.every((item) => typeof item === "string"),
  openSheetOnStart: isBoolean
};

// Stored values over defaults, key by key. Anything missing, invalid or out
// of range falls back to its default, so old or corrupt data can't break the page.
export function mergeSettings(stored) {
  const source = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  const result = {};
  for (const [key, fallback] of Object.entries(DEFAULTS)) {
    result[key] = Object.hasOwn(source, key) && VALIDATORS[key](source[key]) ? source[key] : fallback;
  }
  result.hiddenTopSites = [...result.hiddenTopSites];
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Implement `js/settings-store.js`**

```js
import { api } from "./api.js";
import { mergeSettings } from "./lib/settings-schema.js";

const SETTINGS_KEY = "settings";

let current = mergeSettings(undefined);
const listeners = new Set();

function notify() {
  for (const listener of listeners) {
    listener(current);
  }
}

export async function loadSettings() {
  try {
    const stored = await api.storage.local.get(SETTINGS_KEY);
    current = mergeSettings(stored[SETTINGS_KEY]);
  } catch (error) {
    console.error("Failed to load settings:", error);
  }

  // Keeps other open new tabs in step. Also fires for this tab's own saves,
  // which is harmless because every listener just re-renders.
  api.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[SETTINGS_KEY]) {
      current = mergeSettings(changes[SETTINGS_KEY].newValue);
      notify();
    }
  });

  return current;
}

export function getSettings() {
  return current;
}

export async function updateSettings(patch) {
  current = mergeSettings({ ...current, ...patch });
  notify();
  try {
    await api.storage.local.set({ [SETTINGS_KEY]: current });
  } catch (error) {
    console.error("Failed to save settings:", error);
  }
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
```

- [ ] **Step 6: Commit**

```bash
git add js/lib/settings-schema.js js/settings-store.js test/lib/settings-schema.test.js
git commit -m "Add settings schema and store

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Start page shell and bundled photo backgrounds

**Files:**
- Create: `backgrounds/01.webp` … `backgrounds/12.webp`, `js/lib/bundled-photos.js`, `js/lib/rotation.js`, `js/background.js`, `css/start.css`
- Test: `test/lib/rotation.test.js`, `test/lib/bundled-photos.test.js`
- Modify: `newtab.html` (start markup, stylesheet link), `css/base.css` (`body` rule), `js/main.js`

**Interfaces:**
- Consumes: `getSettings`, `subscribe`, `loadSettings` (Task 4); `$`, `createElement` (Task 2).
- Produces:
  - `js/lib/bundled-photos.js`: `export const BUNDLED_PHOTOS: { id: string, file: string, credit: string, source: string }[]`.
  - `js/lib/rotation.js`: `export function periodKey(date: Date, frequency): string`, `export function pickNext(pool: string[], previousId: string|null, random = Math.random): string|null`, `export function resolveBackground({ pool, state, frequency, now, force = false, random = Math.random }): { id: string|null, pickedAt: number, changed: boolean }`.
  - `js/background.js`: `export function paintCachedBackground()`, `export function initBackground()`, `export function nextPhoto(): Promise<void>`, `export function refreshBackground(): Promise<void>`. Pool IDs: bundled IDs as-is; user photos as `"user:" + record.id` (`USER_PHOTO_PREFIX`, used in Task 11).
  - DOM: `#backdrop`, `#start`, `.start-center`, `#photo-credit`; CSS custom property `--darken` on `:root`.

- [ ] **Step 1: Download the bundled photos**

Choose 12 landscape photos on unsplash.com (Unsplash License: free to use, no permission needed). Criteria: calm nature or landscape scenes; mid-tones with no large pure-white area where the clock sits; no people, text, logos or recognisable brands; a mix of times of day and seasons. For each one, open the photo page, right-click the image and copy its `https://images.unsplash.com/photo-…` address. Download a 1920 px WebP version:

```bash
cd /c/dev/Homepage && mkdir -p backgrounds
curl -L "https://images.unsplash.com/photo-<ID>?w=1920&q=75&fm=webp&fit=max" -o backgrounds/01.webp
```

Repeat for `02.webp` … `12.webp`. Write down each photographer's name and the photo page URL.

Check: `ls -l backgrounds` shows 12 files, each under 450 KB and about 4 MB in total. If a file is larger, download it again with `q=65`.

- [ ] **Step 2: Write failing tests**

`test/lib/rotation.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { periodKey, pickNext, resolveBackground } from "../../js/lib/rotation.js";

const at = (text) => new Date(text); // local time, no zone suffix

test("periodKey is per local day for daily and per hour for hourly", () => {
  assert.equal(periodKey(at("2026-10-14T09:59:00"), "daily"), "2026-10-14");
  assert.equal(periodKey(at("2026-10-14T09:59:00"), "hourly"), "2026-10-14T09");
});

test("pickNext never repeats the previous photo when there is a choice", () => {
  for (const random of [() => 0, () => 0.5, () => 0.999]) {
    assert.notEqual(pickNext(["a", "b", "c"], "a", random), "a");
  }
});

test("pickNext with one photo returns it even if it was previous", () => {
  assert.equal(pickNext(["a"], "a", () => 0.3), "a");
});

test("pickNext with an empty pool returns null", () => {
  assert.equal(pickNext([], null), null);
});

test("pickNext stays in range when random returns 1", () => {
  assert.equal(pickNext(["a", "b"], null, () => 1), "b");
});

const pool = ["a", "b", "c"];
const state = { id: "a", pickedAt: at("2026-10-14T09:10:00").getTime() };

test("daily keeps the photo within the same day", () => {
  const result = resolveBackground({ pool, state, frequency: "daily", now: at("2026-10-14T23:59:00") });
  assert.deepEqual(result, { id: "a", pickedAt: state.pickedAt, changed: false });
});

test("daily changes after midnight", () => {
  const now = at("2026-10-15T00:00:00");
  const result = resolveBackground({ pool, state, frequency: "daily", now, random: () => 0 });
  assert.equal(result.changed, true);
  assert.notEqual(result.id, "a");
  assert.equal(result.pickedAt, now.getTime());
});

test("hourly changes when the hour rolls over", () => {
  assert.equal(resolveBackground({ pool, state, frequency: "hourly", now: at("2026-10-14T09:59:00") }).changed, false);
  assert.equal(resolveBackground({ pool, state, frequency: "hourly", now: at("2026-10-14T10:00:00") }).changed, true);
});

test("every-tab always changes", () => {
  assert.equal(resolveBackground({ pool, state, frequency: "every-tab", now: at("2026-10-14T09:10:01") }).changed, true);
});

test("force picks a new photo even within the period", () => {
  const result = resolveBackground({ pool, state, frequency: "daily", now: at("2026-10-14T09:11:00"), force: true, random: () => 0 });
  assert.equal(result.changed, true);
  assert.notEqual(result.id, "a");
});

test("a stored photo that is no longer in the pool is replaced", () => {
  const result = resolveBackground({ pool: ["b", "c"], state, frequency: "daily", now: at("2026-10-14T09:11:00"), random: () => 0 });
  assert.equal(result.changed, true);
  assert.equal(result.id, "b");
});

test("missing or malformed state picks a photo", () => {
  for (const bad of [undefined, null, {}, { id: 3, pickedAt: "x" }]) {
    const result = resolveBackground({ pool, state: bad, frequency: "daily", now: at("2026-10-14T09:11:00"), random: () => 0 });
    assert.equal(result.changed, true);
    assert.equal(result.id, "a");
  }
});

test("an empty pool resolves to null", () => {
  assert.equal(resolveBackground({ pool: [], state, frequency: "daily", now: at("2026-10-14T09:11:00") }).id, null);
});
```

`test/lib/bundled-photos.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { BUNDLED_PHOTOS } from "../../js/lib/bundled-photos.js";

test("there are 12 bundled photos with unique ids", () => {
  assert.equal(BUNDLED_PHOTOS.length, 12);
  assert.equal(new Set(BUNDLED_PHOTOS.map((photo) => photo.id)).size, 12);
});

test("every bundled photo file exists and has a credit", () => {
  for (const photo of BUNDLED_PHOTOS) {
    assert.ok(existsSync(new URL(`../../${photo.file}`, import.meta.url)), photo.file);
    assert.ok(photo.credit.trim().length > 0, `${photo.id} credit`);
    assert.match(photo.source, /^https:\/\/unsplash\.com\/photos\/[^<>]+$/);
    assert.doesNotMatch(photo.credit, /[<>]/, `${photo.id} credit is still a placeholder`);
    assert.equal(photo.id.startsWith("user:"), false);
  }
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm test`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement `js/lib/rotation.js`**

```js
function pad(number) {
  return String(number).padStart(2, "0");
}

// Identifies the local day (daily) or local hour (hourly) a date falls in.
export function periodKey(date, frequency) {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return frequency === "hourly" ? `${day}T${pad(date.getHours())}` : day;
}

// Random photo from the pool, avoiding the previous one when there's a choice.
export function pickNext(pool, previousId, random = Math.random) {
  if (pool.length === 0) {
    return null;
  }
  const candidates = pool.length > 1 ? pool.filter((id) => id !== previousId) : pool;
  const index = Math.min(Math.floor(random() * candidates.length), candidates.length - 1);
  return candidates[index];
}

// Decides which photo to show. Keeps the stored one until its period ends,
// unless it has left the pool or a new pick is forced.
export function resolveBackground({ pool, state, frequency, now, force = false, random = Math.random }) {
  const valid = Boolean(state) && typeof state.id === "string" && typeof state.pickedAt === "number" && pool.includes(state.id);
  const expired = !valid || force || frequency === "every-tab" ||
    periodKey(new Date(state.pickedAt), frequency) !== periodKey(now, frequency);

  if (!expired) {
    return { id: state.id, pickedAt: state.pickedAt, changed: false };
  }
  const previousId = state && typeof state.id === "string" ? state.id : null;
  return { id: pickNext(pool, previousId, random), pickedAt: now.getTime(), changed: true };
}
```

- [ ] **Step 5: Implement `js/lib/bundled-photos.js`** with the real credits from Step 1

```js
// Photos shipped in backgrounds/, all under the Unsplash License.
export const BUNDLED_PHOTOS = [
  { id: "bundled-01", file: "backgrounds/01.webp", credit: "<Photographer name>", source: "https://unsplash.com/photos/<slug>" },
  // ...one entry per file, 01 through 12, with the names and URLs written down in Step 1
];
```

Every entry must hold the real name and URL. The test in Step 2 fails if any is missing.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 7: Add the start page markup**

In `newtab.html`, directly after `<body>`:

```html
  <div id="backdrop" aria-hidden="true"></div>

  <main id="start">
    <div class="start-center"></div>
    <p id="photo-credit"></p>
  </main>
```

Change the manager's `<main class="page">` to `<div class="page">` (and its closing tag to `</div>`), since there can be only one `<main>`. Add `<link rel="stylesheet" href="css/start.css">` after the `base.css` link.

In `css/base.css`, replace the `body` rule's three `background-*` declarations (`background-color`, `background-image`, `background-attachment`) with `background: #1b2433;`. The photo now provides the page background; `#1b2433` is what shows while it loads.

- [ ] **Step 8: Create `css/start.css`**

```css
:root {
  --darken: 0.25;
  --photo-fallback: linear-gradient(165deg, #22344a 0%, #4f6d8a 38%, #b48e6c 72%, #4a3428 100%);
}

/* ---- Background photo ---- */

#backdrop {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  background: var(--photo-fallback);
}

.backdrop-image {
  position: absolute;
  inset: 0;
  background-position: center;
  background-size: cover;
  opacity: 0;
  transition: opacity 0.6s ease;
}

.backdrop-image.is-visible {
  opacity: 1;
}

.backdrop-image.is-instant {
  transition: none;
}

/* Darkens the photo so white text stays readable; strength comes from the Darken setting. */
#backdrop::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg,
    rgb(0 0 0 / calc(var(--darken) * 0.6)) 0%,
    rgb(0 0 0 / var(--darken)) 100%);
}

/* ---- Start page ---- */

#start {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 72px 16px 96px;
  color: #ffffff;
  text-shadow: 0 1px 12px rgb(0 0 0 / 0.25);
}

.start-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: min(640px, 100%);
}

#photo-credit {
  position: absolute;
  right: 16px;
  bottom: 12px;
  margin: 0;
  font-size: 11px;
  opacity: 0.7;
}
```

- [ ] **Step 9: Implement `js/background.js`**

```js
import { api } from "./api.js";
import { $, createElement } from "./ui.js";
import { BUNDLED_PHOTOS } from "./lib/bundled-photos.js";
import { resolveBackground } from "./lib/rotation.js";
import { getSettings, subscribe } from "./settings-store.js";

export const USER_PHOTO_PREFIX = "user:";
const STATE_STORAGE_KEY = "background_state";
// localStorage, so the last bundled photo can be painted before anything async runs.
const CACHE_KEY = "newtab.background";
const FADE_CLEANUP_DELAY_MS = 700;

let currentId = null;
let currentObjectUrl = null;
let generation = 0;
// Overridden in the user-photos task; until then there are no user photos.
let listUserPhotoIds = async () => [];
let loadUserPhoto = async () => null;

export function setUserPhotoSource({ listIds, load }) {
  listUserPhotoIds = listIds;
  loadUserPhoto = load;
}

function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    return cached && typeof cached.id === "string" && typeof cached.file === "string" ? cached : null;
  } catch {
    return null;
  }
}

function writeCache(value) {
  try {
    if (value) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(value));
    } else {
      localStorage.removeItem(CACHE_KEY);
    }
  } catch {
    // Storage blocked (e.g. some private modes): we only lose the instant first paint.
  }
}

function showLayer(src, credit, fade) {
  const backdrop = $("backdrop");
  const previous = [...backdrop.children];
  const layer = createElement("div", `backdrop-image${fade ? "" : " is-instant"}`);
  layer.style.backgroundImage = `url("${src}")`;
  backdrop.append(layer);
  requestAnimationFrame(() => layer.classList.add("is-visible"));
  setTimeout(() => previous.forEach((element) => element.remove()), fade ? FADE_CLEANUP_DELAY_MS : 0);
  $("photo-credit").textContent = credit ? `Photo: ${credit}` : "";
}

function showFallback() {
  $("backdrop").replaceChildren();
  $("photo-credit").textContent = "";
  currentId = null;
  writeCache(null);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Couldn't load ${src}`));
    image.src = src;
  });
}

async function buildPool(settings) {
  const pool = settings.bundledPhotos ? BUNDLED_PHOTOS.map((photo) => photo.id) : [];
  try {
    const userIds = await listUserPhotoIds();
    pool.push(...userIds.map((id) => USER_PHOTO_PREFIX + id));
  } catch (error) {
    console.error("Couldn't list your photos:", error);
  }
  return pool;
}

async function sourceFor(id) {
  if (id.startsWith(USER_PHOTO_PREFIX)) {
    const blob = await loadUserPhoto(id.slice(USER_PHOTO_PREFIX.length));
    if (!blob) {
      throw new Error(`Photo ${id} is missing`);
    }
    return { src: URL.createObjectURL(blob), credit: "", file: null, isObjectUrl: true };
  }
  const photo = BUNDLED_PHOTOS.find((candidate) => candidate.id === id);
  if (!photo) {
    throw new Error(`Unknown photo ${id}`);
  }
  return { src: photo.file, credit: photo.credit, file: photo.file, isObjectUrl: false };
}

async function readState() {
  try {
    return (await api.storage.local.get(STATE_STORAGE_KEY))[STATE_STORAGE_KEY];
  } catch (error) {
    console.error("Couldn't read background state:", error);
    return null;
  }
}

async function updateBackground({ force = false } = {}) {
  const run = ++generation;
  const settings = getSettings();
  const now = new Date();
  let pool = await buildPool(settings);
  let decision = resolveBackground({ pool, state: await readState(), frequency: settings.photoFrequency, now, force });

  while (decision.id) {
    let source = null;
    try {
      source = await sourceFor(decision.id);
      await loadImage(source.src);
    } catch (error) {
      console.warn("Skipping background photo:", error);
      if (source && source.isObjectUrl) {
        URL.revokeObjectURL(source.src);
      }
      // Try the rest of the pool before giving up on photos entirely.
      pool = pool.filter((id) => id !== decision.id);
      decision = resolveBackground({ pool, state: null, frequency: settings.photoFrequency, now });
      continue;
    }

    if (run !== generation) {
      if (source.isObjectUrl) {
        URL.revokeObjectURL(source.src);
      }
      return; // A newer update started while this one was loading.
    }
    if (decision.id !== currentId) {
      showLayer(source.src, source.credit, true);
      if (currentObjectUrl) {
        const stale = currentObjectUrl;
        setTimeout(() => URL.revokeObjectURL(stale), FADE_CLEANUP_DELAY_MS);
      }
      currentObjectUrl = source.isObjectUrl ? source.src : null;
      currentId = decision.id;
    } else if (source.isObjectUrl) {
      URL.revokeObjectURL(source.src);
    }
    writeCache(source.file ? { id: decision.id, file: source.file, credit: source.credit } : null);
    if (decision.changed) {
      try {
        await api.storage.local.set({ [STATE_STORAGE_KEY]: { id: decision.id, pickedAt: decision.pickedAt } });
      } catch (error) {
        console.error("Couldn't save background state:", error);
      }
    }
    return;
  }

  if (run === generation) {
    showFallback();
  }
}

function applyDarken(settings) {
  document.documentElement.style.setProperty("--darken", String(settings.darken / 100));
}

// Paints the last bundled photo straight away so a new tab never flashes empty.
export function paintCachedBackground() {
  const cached = readCache();
  if (cached) {
    showLayer(cached.file, cached.credit || "", false);
    currentId = cached.id;
  }
}

export function initBackground() {
  let previous = getSettings();
  applyDarken(previous);
  updateBackground();

  subscribe((settings) => {
    applyDarken(settings);
    if (settings.bundledPhotos !== previous.bundledPhotos || settings.photoFrequency !== previous.photoFrequency) {
      updateBackground();
    }
    previous = settings;
  });
}

export function nextPhoto() {
  return updateBackground({ force: true });
}

export function refreshBackground() {
  return updateBackground();
}
```

- [ ] **Step 10: Wire it into `js/main.js`**

Add imports:

```js
import { paintCachedBackground, initBackground } from "./background.js";
import { loadSettings } from "./settings-store.js";
```

Directly after the imports (before `function initLegacySettingsToggle`), add:

```js
// Runs before anything awaits, so the last photo is on the first frame.
paintCachedBackground();
```

In `init()`, after `hydrateIcons(document);`, add:

```js
  await loadSettings();
  initBackground();
```

- [ ] **Step 11: Browser check**

Reload with the stub. The first screen is a full-height photo with "Photo: <name>" in the bottom-right corner, and the manager is below it when you scroll down. Reload again: the same photo (daily). Then, in `browser_evaluate`:
1. `localStorage.getItem("newtab.background")` returns the cached JSON.
2. `window.__stub.data.background_state` has `id` and `pickedAt`.
3. Run `import("/js/settings-store.js").then(m => m.updateSettings({ photoFrequency: "every-tab" }))`: the photo cross-fades to a different one.
4. Run `import("/js/background.js").then(m => m.nextPhoto())` three times: each call shows a different photo from the previous one.
5. Run `import("/js/settings-store.js").then(m => m.updateSettings({ bundledPhotos: false }))`: the calm gradient shows and the credit is empty.
6. Run `import("/js/settings-store.js").then(m => m.updateSettings({ darken: 60 }))`: the photo darkens visibly.

- [ ] **Step 12: Commit**

```bash
git add backgrounds js css newtab.html test
git commit -m "Add start page with rotating bundled photo backgrounds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Clock, date and greeting

**Files:**
- Create: `js/lib/greeting.js`, `js/clock.js`
- Test: `test/lib/greeting.test.js`
- Modify: `newtab.html` (`.start-center` contents), `css/start.css`, `js/main.js`

**Interfaces:**
- Consumes: `getSettings`, `subscribe` (Task 4).
- Produces:
  - `js/lib/greeting.js`: `export function greetingFor(hour: number): string`, `export function greetingText(hour: number, name: string): string`, `export function uses12Hour(format: "auto"|"12h"|"24h", locale: string): boolean`, `export function formatTime(date: Date, twelveHour: boolean): string`, `export function msUntilNextMinute(date: Date): number`.
  - `js/clock.js`: `export function initClock()`.
  - DOM: `#clock`, `#date-line`, `#date-text`, `#date-sep`, `#greeting`.

- [ ] **Step 1: Write the failing test**

`test/lib/greeting.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { greetingFor, greetingText, uses12Hour, formatTime, msUntilNextMinute } from "../../js/lib/greeting.js";

test("greeting boundaries", () => {
  const cases = [
    [4, "Good night"], [5, "Good morning"], [11, "Good morning"],
    [12, "Good afternoon"], [16, "Good afternoon"],
    [17, "Good evening"], [21, "Good evening"],
    [22, "Good night"], [0, "Good night"]
  ];
  for (const [hour, expected] of cases) {
    assert.equal(greetingFor(hour), expected, `hour ${hour}`);
  }
});

test("greetingText adds a trimmed name only when there is one", () => {
  assert.equal(greetingText(9, "Jon"), "Good morning, Jon");
  assert.equal(greetingText(9, "  Jon  "), "Good morning, Jon");
  assert.equal(greetingText(9, "   "), "Good morning");
  assert.equal(greetingText(9, ""), "Good morning");
});

test("uses12Hour honours explicit formats", () => {
  assert.equal(uses12Hour("12h", "en-GB"), true);
  assert.equal(uses12Hour("24h", "en-US"), false);
});

test("uses12Hour auto follows the locale", () => {
  assert.equal(uses12Hour("auto", "en-US"), true);
  assert.equal(uses12Hour("auto", "en-GB"), false);
  assert.equal(uses12Hour("auto", "de-DE"), false);
});

test("formatTime 12-hour has no leading zero and maps 0 and 12 to 12", () => {
  assert.equal(formatTime(new Date(2026, 9, 14, 0, 5), true), "12:05");
  assert.equal(formatTime(new Date(2026, 9, 14, 9, 41), true), "9:41");
  assert.equal(formatTime(new Date(2026, 9, 14, 12, 0), true), "12:00");
  assert.equal(formatTime(new Date(2026, 9, 14, 23, 59), true), "11:59");
});

test("formatTime 24-hour pads hours", () => {
  assert.equal(formatTime(new Date(2026, 9, 14, 0, 5), false), "00:05");
  assert.equal(formatTime(new Date(2026, 9, 14, 23, 59), false), "23:59");
});

test("msUntilNextMinute", () => {
  assert.equal(msUntilNextMinute(new Date(2026, 9, 14, 9, 41, 0, 0)), 60000);
  assert.equal(msUntilNextMinute(new Date(2026, 9, 14, 9, 41, 59, 900)), 100);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `js/lib/greeting.js`**

```js
export function greetingFor(hour) {
  if (hour >= 5 && hour < 12) {
    return "Good morning";
  }
  if (hour >= 12 && hour < 17) {
    return "Good afternoon";
  }
  if (hour >= 17 && hour < 22) {
    return "Good evening";
  }
  return "Good night";
}

export function greetingText(hour, name) {
  const trimmed = name.trim();
  return trimmed ? `${greetingFor(hour)}, ${trimmed}` : greetingFor(hour);
}

export function uses12Hour(format, locale) {
  if (format === "12h") {
    return true;
  }
  if (format === "24h") {
    return false;
  }
  const options = new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions();
  if (typeof options.hour12 === "boolean") {
    return options.hour12;
  }
  return options.hourCycle === "h11" || options.hourCycle === "h12";
}

// Hours and minutes only; Bonjourr-style, no AM/PM suffix.
export function formatTime(date, twelveHour) {
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const hours = date.getHours();
  return twelveHour ? `${hours % 12 || 12}:${minutes}` : `${String(hours).padStart(2, "0")}:${minutes}`;
}

export function msUntilNextMinute(date) {
  return 60000 - (date.getSeconds() * 1000 + date.getMilliseconds());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Markup and styles**

Inside `.start-center` in `newtab.html`:

```html
      <time id="clock"></time>
      <p id="date-line"><span id="date-text"></span><span id="date-sep" aria-hidden="true"> · </span><span id="greeting"></span></p>
```

Append to `css/start.css`:

```css
/* ---- Clock and greeting ---- */

#clock {
  font-size: clamp(64px, 11vw, 132px);
  font-weight: 200;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  letter-spacing: 0.01em;
}

#date-line {
  margin: 0;
  font-size: 17px;
  font-weight: 500;
  opacity: 0.95;
}
```

- [ ] **Step 6: Implement `js/clock.js`**

```js
import { $ } from "./ui.js";
import { greetingText, uses12Hour, formatTime, msUntilNextMinute } from "./lib/greeting.js";
import { getSettings, subscribe } from "./settings-store.js";

// A little past the minute, so the timer never fires a hair early.
const TICK_SLACK_MS = 50;

let timer = null;

function render() {
  const settings = getSettings();
  const now = new Date();
  const locale = navigator.language;

  const clock = $("clock");
  clock.hidden = !settings.showClock;
  clock.textContent = formatTime(now, uses12Hour(settings.timeFormat, locale));
  clock.dateTime = now.toISOString();

  const dateText = settings.showDate
    ? new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(now)
    : "";
  const greeting = settings.showGreeting ? greetingText(now.getHours(), settings.name) : "";
  $("date-text").textContent = dateText;
  $("greeting").textContent = greeting;
  $("date-sep").hidden = !(dateText && greeting);
  $("date-line").hidden = !(dateText || greeting);
}

function scheduleTick() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    render();
    scheduleTick();
  }, msUntilNextMinute(new Date()) + TICK_SLACK_MS);
}

export function initClock() {
  render();
  scheduleTick();
  subscribe(render);
  // Background tabs throttle timers; catch up as soon as the tab is shown.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      render();
      scheduleTick();
    }
  });
}
```

- [ ] **Step 7: Wire into `js/main.js`**

Add `import { initClock } from "./clock.js";` and call `initClock();` right after `initBackground();`.

- [ ] **Step 8: Browser check**

Reload. The clock matches the system time, and the date line reads like "Wednesday, October 14 · Good evening" (the exact wording follows the locale and the hour). In `browser_evaluate`:
1. `import("/js/settings-store.js").then(m => m.updateSettings({ name: "Jon", timeFormat: "24h" }))`: the greeting ends ", Jon" and the clock shows 24-hour time.
2. `...updateSettings({ showDate: false })`: the separator dot disappears and only the greeting shows.
3. `...updateSettings({ showGreeting: false })`: the whole date line is hidden.
4. `...updateSettings({ showClock: false })`: the clock is hidden.

Use `browser_resize` to 375×700: the clock fits without horizontal scroll.

- [ ] **Step 9: Commit**

```bash
git add js css newtab.html test
git commit -m "Add clock, date and greeting to the start page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Start-page search with bookmark suggestions

**Files:**
- Create: `js/start-search.js`, `js/shortcuts.js`
- Modify: `js/lib/url.js`, `test/lib/url.test.js`, `js/manager.js` (add `searchBookmarks`, remove the `/` listener), `newtab.html`, `css/start.css`, `js/main.js`, `manifest.json`

**Interfaces:**
- Consumes: `normalizeUrl` (Task 2), `bookmarkMatches` (Task 2), `getSettings`/`subscribe` (Task 4), `isTypingTarget`, `showToast` (Task 2).
- Produces:
  - `js/lib/url.js`: `export function looksLikeUrl(input: string): boolean`, `export function searchText(input: string): string`, `export function toNavigableUrl(input: string): string` (throws like `normalizeUrl`).
  - `js/manager.js`: `export function searchBookmarks(query: string, limit: number): { id, title, url, folder }[]`.
  - `js/start-search.js`: `export function initStartSearch()`.
  - `js/shortcuts.js`: `export function initShortcuts()`. The sheet task extends it. It reads `document.body.dataset.sheet === "open"` to route `/`.
  - DOM: `#start-search-form`, `#start-search` (combobox), `#search-suggestions` (listbox, `li.suggestion[role=option]`).

- [ ] **Step 1: Add failing tests to `test/lib/url.test.js`**

Change the import line to `import { normalizeUrl, looksLikeUrl, searchText, toNavigableUrl } from "../../js/lib/url.js";` and append:

```js
test("looksLikeUrl accepts addresses", () => {
  for (const text of [
    "example.com", "www.example.co.uk/path?q=1", "http://intranet", "localhost",
    "localhost:3000/app", "192.168.1.1", "10.0.0.2:8080", "github.com/jonesyco/NewTab",
    "mailto:me@example.com", "bücher.de"
  ]) {
    assert.equal(looksLikeUrl(text), true, text);
  }
});

test("looksLikeUrl sends ordinary queries to search", () => {
  for (const text of ["", "   ", "weather", "how to cook rice", "what is example.com", "c++", "1.5", "3.14 pi"]) {
    assert.equal(looksLikeUrl(text), false, text);
  }
});

test("looksLikeUrl treats a bare file name as a search (Review Focus 1)", () => {
  for (const text of ["node.js", "readme.md", "setup.py", "notes.txt", "package.json"]) {
    assert.equal(looksLikeUrl(text), false, text);
  }
  // With a path or port it's clearly an address again.
  assert.equal(looksLikeUrl("node.js/docs"), true);
});

test("a leading ? always forces a search", () => {
  assert.equal(looksLikeUrl("?example.com"), false);
  assert.equal(searchText("?example.com"), "example.com");
  assert.equal(searchText("? weather"), "weather");
  assert.equal(searchText("  weather  "), "weather");
});

test("toNavigableUrl uses http for local hosts and https otherwise", () => {
  assert.equal(toNavigableUrl("localhost:3000"), "http://localhost:3000/");
  assert.equal(toNavigableUrl("192.168.1.1"), "http://192.168.1.1/");
  assert.equal(toNavigableUrl("example.com"), "https://example.com/");
  assert.equal(toNavigableUrl("http://example.com"), "http://example.com/");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL with a SyntaxError that `url.js` does not provide an export named `looksLikeUrl`.

- [ ] **Step 3: Implement in `js/lib/url.js`** (append)

```js
// Extensions that are also TLDs: "node.js" alone is far more likely a search.
const FILE_EXTENSIONS = new Set([
  "js", "ts", "md", "py", "txt", "json", "css", "html", "rs", "go", "sh",
  "yml", "yaml", "xml", "csv", "pdf", "doc", "docx", "png", "jpg", "zip", "exe"
]);

function isLocalHost(host) {
  return host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

// Decides whether start-page input is an address to open rather than a search.
export function looksLikeUrl(input) {
  const text = input.trim();
  if (!text || text.startsWith("?") || /\s/.test(text)) {
    return false;
  }
  if (/^(https?|ftp):\/\//i.test(text) || /^mailto:/i.test(text)) {
    return true;
  }
  const match = text.match(/^([^/?#:]+)(:\d{1,5})?([/?#].*)?$/);
  if (!match) {
    return false;
  }
  const host = match[1].toLowerCase();
  if (isLocalHost(host)) {
    return true;
  }
  const labels = host.split(".");
  if (labels.length < 2 || labels.some((label) => !/^[\p{L}\p{N}-]+$/u.test(label))) {
    return false;
  }
  const tld = labels[labels.length - 1];
  if (!/^\p{L}{2,24}$/u.test(tld)) {
    return false;
  }
  const bare = labels.length === 2 && !match[2] && !match[3];
  return !(bare && FILE_EXTENSIONS.has(tld));
}

// The text to search for: trimmed, without a leading "?" (which forces a search).
export function searchText(input) {
  return input.trim().replace(/^\?\s*/, "");
}

// Like normalizeUrl, but local addresses get http:// since they rarely have certificates.
export function toNavigableUrl(input) {
  const text = input.trim();
  const host = text.split(/[/:?#]/)[0].toLowerCase();
  // "localhost:3000" has no scheme; only "scheme://" or "mailto:" count as one.
  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(text) || /^mailto:/i.test(text);
  if (!hasScheme && isLocalHost(host)) {
    return normalizeUrl(`http://${text}`);
  }
  return normalizeUrl(text);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Add `searchBookmarks` to `js/manager.js`; remove its `/` shortcut**

Add, after `filterTree`:

```js
// Best bookmark matches for the start-page search box.
export function searchBookmarks(query, limit) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  const matches = flattenBookmarks(state.topLevel, [], []).filter((bookmark) => bookmarkMatches(bookmark, needle, state.notes));
  return sortBookmarks(matches).slice(0, limit);
}
```

In `initSearch`, delete the whole `document.addEventListener("keydown", …)` block (the `/` shortcut). `js/shortcuts.js` takes it over.

- [ ] **Step 6: Markup, styles and manifest**

In `.start-center`, after `#date-line`:

```html
      <form id="start-search-form" class="start-search" role="search" autocomplete="off">
        <span class="start-search-icon icon-slot" data-icon="search"></span>
        <input id="start-search" type="search" placeholder="Search the web or your bookmarks" spellcheck="false"
          role="combobox" aria-label="Search" aria-autocomplete="list" aria-controls="search-suggestions" aria-expanded="false">
        <ul id="search-suggestions" role="listbox" aria-label="Matching bookmarks" hidden></ul>
      </form>
```

Append to `css/start.css`:

```css
/* ---- Search ---- */

.start-search {
  position: relative;
  width: min(560px, 100%);
  margin-top: 10px;
  text-shadow: none;
}

.start-search-icon {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 16px;
  color: rgb(255 255 255 / 0.85);
  pointer-events: none;
}

#start-search {
  width: 100%;
  height: 48px;
  padding: 0 20px 0 46px;
  background: rgb(255 255 255 / 0.18);
  color: #ffffff;
  border: 1px solid rgb(255 255 255 / 0.35);
  border-radius: 999px;
  font: inherit;
  font-size: 16px;
  backdrop-filter: blur(14px) saturate(1.3);
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

#start-search::placeholder {
  color: rgb(255 255 255 / 0.75);
}

#start-search:focus {
  outline: none;
  background: rgb(255 255 255 / 0.26);
  border-color: rgb(255 255 255 / 0.7);
}

#search-suggestions {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 5;
  margin: 0;
  padding: 6px;
  list-style: none;
  background: var(--glass-bg, rgb(20 24 36 / 0.7));
  color: var(--text);
  border: 1px solid var(--glass-border, rgb(255 255 255 / 0.2));
  border-radius: 16px;
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(24px) saturate(1.3);
}

.suggestion {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
}

.suggestion[aria-selected="true"],
.suggestion:hover {
  background: var(--accent-soft);
}

.suggestion .bookmark-avatar {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  font-size: 12px;
}

.suggestion-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.suggestion-title {
  overflow: hidden;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.suggestion-url {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
```

In `manifest.json`, change `"permissions"` to `["bookmarks", "storage", "search"]`.

- [ ] **Step 7: Implement `js/start-search.js`**

```js
import { api } from "./api.js";
import { $, createElement, hashHue, hostOf, avatarLetter, formatUrlForDisplay, showToast } from "./ui.js";
import { looksLikeUrl, searchText, toNavigableUrl } from "./lib/url.js";
import { searchBookmarks } from "./manager.js";
import { getSettings, subscribe } from "./settings-store.js";

const SUGGESTION_LIMIT = 5;

let suggestions = [];
let activeIndex = -1;

function openUrl(url) {
  window.location.href = url;
}

function renderSuggestions() {
  const input = $("start-search");
  const list = $("search-suggestions");

  list.replaceChildren(...suggestions.map((bookmark, index) => {
    const item = createElement("li", "suggestion");
    item.id = `suggestion-${index}`;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(index === activeIndex));
    item.style.setProperty("--hue", String(hashHue(hostOf(bookmark.url))));

    const avatar = createElement("span", "bookmark-avatar", avatarLetter(bookmark.title));
    avatar.setAttribute("aria-hidden", "true");
    const text = createElement("span", "suggestion-text");
    text.append(
      createElement("span", "suggestion-title", bookmark.title),
      createElement("span", "suggestion-url", formatUrlForDisplay(bookmark.url))
    );
    item.append(avatar, text);

    // Keep focus in the input so the list doesn't close before the click lands.
    item.addEventListener("pointerdown", (event) => event.preventDefault());
    item.addEventListener("click", () => openUrl(bookmark.url));
    return item;
  }));

  list.hidden = suggestions.length === 0;
  input.setAttribute("aria-expanded", String(!list.hidden));
  if (activeIndex >= 0) {
    input.setAttribute("aria-activedescendant", `suggestion-${activeIndex}`);
  } else {
    input.removeAttribute("aria-activedescendant");
  }
}

function updateSuggestions() {
  const query = searchText($("start-search").value);
  suggestions = getSettings().searchSuggestions && query ? searchBookmarks(query, SUGGESTION_LIMIT) : [];
  activeIndex = -1;
  renderSuggestions();
}

function closeSuggestions() {
  suggestions = [];
  activeIndex = -1;
  renderSuggestions();
}

async function submit() {
  const raw = $("start-search").value;
  if (activeIndex >= 0) {
    openUrl(suggestions[activeIndex].url);
    return;
  }
  if (!raw.trim()) {
    return;
  }
  if (looksLikeUrl(raw)) {
    try {
      openUrl(toNavigableUrl(raw));
      return;
    } catch {
      // Not a usable address after all; search for it instead.
    }
  }
  const text = searchText(raw);
  try {
    if (api.search.query) {
      await api.search.query({ text, disposition: "CURRENT_TAB" });
    } else {
      await api.search.search({ query: text });
    }
  } catch (error) {
    console.error("Search failed:", error);
    showToast("Couldn't search", "error");
  }
}

function applyVisibility(settings) {
  $("start-search-form").hidden = !settings.showSearch;
  if (!settings.searchSuggestions) {
    closeSuggestions();
  }
}

export function initStartSearch() {
  const form = $("start-search-form");
  const input = $("start-search");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submit();
  });

  input.addEventListener("input", updateSuggestions);
  input.addEventListener("blur", closeSuggestions);

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (suggestions.length === 0) {
        return;
      }
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      // -1 means "nothing selected", so the cycle runs -1, 0 … n-1, -1.
      activeIndex = ((activeIndex + 1 + step + suggestions.length + 1) % (suggestions.length + 1)) - 1;
      renderSuggestions();
    } else if (event.key === "Escape") {
      if (suggestions.length > 0) {
        event.preventDefault();
        closeSuggestions();
      } else if (input.value) {
        event.preventDefault();
        input.value = "";
      }
    }
  });

  applyVisibility(getSettings());
  subscribe(applyVisibility);
}
```

- [ ] **Step 8: Implement `js/shortcuts.js`**

```js
import { $, isTypingTarget } from "./ui.js";

function focusSearchField() {
  const sheetOpen = document.body.dataset.sheet === "open";
  const field = sheetOpen ? $("search-input") : $("start-search");
  if (field.closest("[hidden]")) {
    return;
  }
  field.focus();
}

export function initShortcuts() {
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (document.querySelector("dialog[open]") || isTypingTarget(event.target)) {
      return;
    }
    if (event.key === "/") {
      event.preventDefault();
      focusSearchField();
    }
  });
}
```

- [ ] **Step 9: Wire into `js/main.js`**

Import `initStartSearch` and `initShortcuts`; call both after `initClock();`.

- [ ] **Step 10: Browser check**

Reload with the stub, then:
1. Press `/`: the start search is focused.
2. Type `hub`: one suggestion "GitHub · github.com". Press ↓ and then Enter: the page navigates to `https://github.com/`. Go back and reload with the stub.
3. Type `weather` and press Enter: `window.__stub.searches` equals `[{ text: "weather", disposition: "CURRENT_TAB" }]`.
4. Type `node.js` and press Enter: a search for `node.js` is recorded (no navigation).
5. Type `example.com` and press Enter: the page navigates to `https://example.com/`. Go back.
6. Type `hub`, then press Esc: the suggestions close. Press Esc again: the input clears.
7. Run `updateSettings({ searchSuggestions: false })`, then type `hub`: no list appears.

- [ ] **Step 11: Commit**

```bash
git add js css newtab.html test manifest.json
git commit -m "Add start page search with bookmark suggestions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Top sites row

**Files:**
- Create: `js/lib/top-sites.js`, `js/top-sites-row.js`
- Test: `test/lib/top-sites.test.js`
- Modify: `newtab.html`, `css/start.css`, `js/main.js`, `manifest.json`

**Interfaces:**
- Consumes: `api`, `isChromium` (Task 2); `getSettings`, `subscribe`, `updateSettings` (Task 4); `createIcon("x")` (Task 2).
- Produces:
  - `js/lib/top-sites.js`: `export function visibleTopSites(sites: {url,title}[], hidden: string[], count: number): { url: string, title: string }[]`.
  - `js/top-sites-row.js`: `export async function initTopSites()`.
  - DOM: `#top-sites` (nav), `.top-site`, `.top-site-link`, `.top-site-icon`, `.top-site-letter`, `.top-site-title`, `.top-site-hide`.

- [ ] **Step 1: Write the failing test**

`test/lib/top-sites.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleTopSites } from "../../js/lib/top-sites.js";

const sites = [
  { url: "https://github.com/", title: "GitHub" },
  { url: "chrome://newtab/", title: "New Tab" },
  { url: "https://github.com/", title: "GitHub again" },
  { url: "file:///C:/notes.txt", title: "notes" },
  { url: "about:blank", title: "" },
  { url: "https://www.reddit.com/", title: "" },
  { url: "not a url", title: "bad" },
  { url: "https://example.com/", title: "Example" }
];

test("keeps only unique http(s) sites, in order (Review Focus 5)", () => {
  assert.deepEqual(visibleTopSites(sites, [], 12).map((site) => site.url), [
    "https://github.com/", "https://www.reddit.com/", "https://example.com/"
  ]);
});

test("missing titles fall back to the host without www", () => {
  assert.equal(visibleTopSites(sites, [], 12)[1].title, "reddit.com");
});

test("hidden sites are skipped and the count is still filled from later sites", () => {
  assert.deepEqual(visibleTopSites(sites, ["https://github.com/"], 2).map((site) => site.url), [
    "https://www.reddit.com/", "https://example.com/"
  ]);
});

test("count limits the result and 0 hides everything", () => {
  assert.equal(visibleTopSites(sites, [], 1).length, 1);
  assert.deepEqual(visibleTopSites(sites, [], 0), []);
});

test("empty or invalid input gives an empty list", () => {
  assert.deepEqual(visibleTopSites([], [], 8), []);
  assert.deepEqual(visibleTopSites(undefined, [], 8), []);
  assert.deepEqual(visibleTopSites([null, { title: "no url" }], [], 8), []);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `js/lib/top-sites.js`**

```js
// The sites to show: web pages only, no duplicates, none the user hid.
export function visibleTopSites(sites, hidden, count) {
  if (!Array.isArray(sites) || count <= 0) {
    return [];
  }
  const hiddenUrls = new Set(hidden);
  const seen = new Set();
  const result = [];
  for (const site of sites) {
    if (!site || typeof site.url !== "string") {
      continue;
    }
    let parsed;
    try {
      parsed = new URL(site.url);
    } catch {
      continue;
    }
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || hiddenUrls.has(site.url) || seen.has(site.url)) {
      continue;
    }
    seen.add(site.url);
    result.push({ url: site.url, title: site.title || parsed.hostname.replace(/^www\./, "") });
    if (result.length === count) {
      break;
    }
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Markup, styles and manifest**

In `.start-center`, after the search form: `<nav id="top-sites" aria-label="Most visited sites" hidden></nav>`.

Append to `css/start.css`:

```css
/* ---- Top sites ---- */

#top-sites {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 14px;
  margin-top: 12px;
}

.top-site {
  position: relative;
  width: 76px;
}

.top-site-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: #ffffff;
  text-decoration: none;
}

.top-site-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  background: rgb(255 255 255 / 0.2);
  border: 1px solid rgb(255 255 255 / 0.28);
  border-radius: 16px;
  backdrop-filter: blur(12px) saturate(1.3);
  transition: transform 0.15s ease, background-color 0.15s ease;
}

.top-site-link:hover .top-site-icon,
.top-site-link:focus-visible .top-site-icon {
  background: rgb(255 255 255 / 0.32);
  transform: translateY(-2px);
}

.top-site-icon img {
  width: 28px;
  height: 28px;
}

.top-site-letter {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  background: hsl(var(--hue) var(--hue-s) var(--avatar-bg-l));
  color: hsl(var(--hue) var(--hue-s) var(--avatar-fg-l));
  border-radius: 10px;
  font-weight: 700;
  text-shadow: none;
}

.top-site-title {
  max-width: 100%;
  overflow: hidden;
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.top-site-hide {
  position: absolute;
  top: -6px;
  right: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  background: rgb(0 0 0 / 0.55);
  color: #ffffff;
  border: none;
  border-radius: 50%;
  font-size: 11px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.top-site:hover .top-site-hide,
.top-site:focus-within .top-site-hide {
  opacity: 1;
}

@media (hover: none) {
  .top-site-hide {
    opacity: 1;
  }
}
```

In `manifest.json`, set `"permissions": ["bookmarks", "storage", "search", "topSites", "favicon"]`.

- [ ] **Step 6: Implement `js/top-sites-row.js`**

```js
import { api, isChromium } from "./api.js";
import { $, createElement, createIcon, hashHue, hostOf, avatarLetter } from "./ui.js";
import { visibleTopSites } from "./lib/top-sites.js";
import { getSettings, subscribe, updateSettings } from "./settings-store.js";

let allSites = [];

// Chrome's built-in favicon cache; served locally, never fetched from the web.
function faviconUrl(pageUrl) {
  return api.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=64`);
}

function createLetterTile(site) {
  const tile = createElement("span", "top-site-letter", avatarLetter(site.title));
  tile.style.setProperty("--hue", String(hashHue(hostOf(site.url))));
  tile.setAttribute("aria-hidden", "true");
  return tile;
}

function createTile(site) {
  const item = createElement("div", "top-site");

  const link = createElement("a", "top-site-link");
  link.href = site.url;
  link.title = site.title;

  const icon = createElement("span", "top-site-icon");
  if (isChromium) {
    const image = document.createElement("img");
    image.alt = "";
    image.src = faviconUrl(site.url);
    image.addEventListener("error", () => icon.replaceChildren(createLetterTile(site)), { once: true });
    icon.append(image);
  } else {
    icon.append(createLetterTile(site));
  }
  link.append(icon, createElement("span", "top-site-title", site.title));

  const hide = createElement("button", "top-site-hide");
  hide.type = "button";
  hide.title = `Hide ${site.title}`;
  hide.setAttribute("aria-label", `Hide ${site.title}`);
  hide.append(createIcon("x"));
  hide.addEventListener("click", () => {
    updateSettings({ hiddenTopSites: [...getSettings().hiddenTopSites, site.url] });
  });

  item.append(link, hide);
  return item;
}

function render(settings) {
  const sites = visibleTopSites(allSites, settings.hiddenTopSites, settings.topSitesCount);
  const nav = $("top-sites");
  nav.replaceChildren(...sites.map(createTile));
  nav.hidden = sites.length === 0;
}

export async function initTopSites() {
  try {
    allSites = (await api.topSites.get()) || [];
  } catch (error) {
    console.error("Couldn't read top sites:", error);
    allSites = [];
  }
  render(getSettings());
  subscribe(render);
}
```

- [ ] **Step 7: Wire into `js/main.js`**

Import `initTopSites` and call it **without** `await` after `initStartSearch();`, so a slow top-sites call never holds up the manager: `initTopSites();`.

- [ ] **Step 8: Browser check**

Reload with the stub. Eight tiles show, in this order: GitHub, YouTube, Hacker News, Inbox, MDN, Wikipedia, Calendar, reddit.com. There is no "New Tab" and no duplicate GitHub. The stub page is `http:`, so the `_favicon` URL fails and every tile shows a coloured letter (this exercises the fallback). Then:
1. Hover GitHub and click ×: GitHub disappears and "Example" fills the row from the end.
2. `updateSettings({ topSitesCount: 3 })`: three tiles show.
3. `updateSettings({ topSitesCount: 0 })`: the row is hidden.
4. Set `window.__stub.topSites = []` and reload with the stub: the row is hidden and the console has no errors.

- [ ] **Step 9: Commit**

```bash
git add js css newtab.html test manifest.json
git commit -m "Add most-visited sites row to the start page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Bottom sheet and glass styling

**Files:**
- Create: `js/lib/wheel.js`, `js/sheet.js`
- Test: `test/lib/wheel.test.js`
- Modify: `newtab.html` (wrap the manager), `css/base.css` (glass tokens, modal), `css/sheet.css`, `css/start.css`, `js/shortcuts.js`, `js/main.js`

**Interfaces:**
- Consumes: `isTypingTarget` (Task 2), `getSettings` (Task 4), the `body[data-sheet]` contract from Task 7.
- Produces:
  - `js/lib/wheel.js`: `export const GESTURE_GAP_MS = 250`; `export function wheelAction({ open: boolean, deltaY: number, scrollTop: number, now: number, lastWheelAt: number }): "open"|"close"|null`.
  - `js/sheet.js`: `export function initSheet()`, `export function isSheetOpen(): boolean`, `export function setSheetOpen(open: boolean, { focus = true } = {})`.
  - DOM: `#sheet`, `#sheet-handle` (button, `aria-expanded`), `#sheet-body`; `body[data-sheet="open"|"closed"]`.
  - CSS tokens: `--glass-bg`, `--glass-border` (light and dark).

- [ ] **Step 1: Write the failing test**

`test/lib/wheel.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { wheelAction, GESTURE_GAP_MS } from "../../js/lib/wheel.js";

const fresh = { now: 10000, lastWheelAt: 10000 - GESTURE_GAP_MS };
const momentum = { now: 10000, lastWheelAt: 10000 - 16 };

test("scrolling down on the start page opens the sheet", () => {
  assert.equal(wheelAction({ open: false, deltaY: 40, scrollTop: 0, ...fresh }), "open");
});

test("scrolling up on the start page does nothing", () => {
  assert.equal(wheelAction({ open: false, deltaY: -40, scrollTop: 0, ...fresh }), null);
});

test("a fresh upward flick at the top of the sheet closes it", () => {
  assert.equal(wheelAction({ open: true, deltaY: -40, scrollTop: 0, ...fresh }), "close");
});

test("momentum arriving at the top does not close the sheet (Review Focus 2)", () => {
  assert.equal(wheelAction({ open: true, deltaY: -40, scrollTop: 0, ...momentum }), null);
});

test("scrolling up inside the list (not at top) does not close", () => {
  assert.equal(wheelAction({ open: true, deltaY: -40, scrollTop: 120, ...fresh }), null);
});

test("scrolling down inside the open sheet does nothing", () => {
  assert.equal(wheelAction({ open: true, deltaY: 40, scrollTop: 0, ...fresh }), null);
});

test("momentum after closing does not reopen", () => {
  assert.equal(wheelAction({ open: false, deltaY: 40, scrollTop: 0, ...momentum }), null);
});

test("the first wheel event ever counts as fresh", () => {
  assert.equal(wheelAction({ open: false, deltaY: 40, scrollTop: 0, now: 5, lastWheelAt: -Infinity }), "open");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `js/lib/wheel.js`**

```js
// Wheel events closer together than this belong to one gesture (including
// trackpad momentum). Only a new gesture may open or close the sheet.
export const GESTURE_GAP_MS = 250;

export function wheelAction({ open, deltaY, scrollTop, now, lastWheelAt }) {
  if (now - lastWheelAt < GESTURE_GAP_MS) {
    return null;
  }
  if (!open) {
    return deltaY > 0 ? "open" : null;
  }
  return deltaY < 0 && scrollTop <= 0 ? "close" : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Wrap the manager in the sheet**

In `newtab.html`, wrap `<header id="app-header">…</header>` and `<div class="page">…</div>` like this:

```html
  <section id="sheet" aria-label="Bookmarks">
    <button type="button" id="sheet-handle" aria-expanded="false" aria-controls="sheet-body">
      <span class="sheet-grip" aria-hidden="true"></span>
      <span class="sheet-handle-label">Bookmarks</span>
    </button>
    <div id="sheet-body" inert>
      <!-- existing <header id="app-header"> … </header> -->
      <!-- existing <div class="page"> … </div> -->
    </div>
  </section>
```

Add `data-sheet="closed"` to `<body>`.

- [ ] **Step 6: Glass tokens and sheet styles**

In `css/base.css` `:root` (light), set:

```css
  --surface: rgba(255, 255, 255, 0.66);
  --surface-2: rgba(255, 255, 255, 0.45);
  --border: rgba(255, 255, 255, 0.7);
  --glass-bg: rgba(246, 247, 252, 0.74);
  --glass-border: rgba(255, 255, 255, 0.6);
```

In the dark `:root` block, set:

```css
    --surface: rgba(32, 36, 52, 0.62);
    --surface-2: rgba(255, 255, 255, 0.07);
    --border: rgba(255, 255, 255, 0.1);
    --glass-bg: rgba(14, 16, 26, 0.64);
    --glass-border: rgba(255, 255, 255, 0.12);
```

In `.modal`, change `background: var(--surface);` to `background: var(--glass-bg);` and add `backdrop-filter: blur(28px) saturate(1.3);`.

In `css/sheet.css`, change `#app-header`'s `background` to `color-mix(in srgb, var(--glass-bg) 70%, transparent)` and its `border-bottom` colour to `var(--border)`. Then append:

```css
/* ---- Bottom sheet ---- */

:root {
  --sheet-top: 15vh;
  --sheet-peek: 56px;
}

#sheet {
  position: fixed;
  top: var(--sheet-top);
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  color: var(--text);
  border-top: 1px solid transparent;
  border-radius: 22px 22px 0 0;
  transform: translateY(calc(100% - var(--sheet-peek) + var(--drag-offset, 0px)));
  transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), background-color 0.3s ease;
}

body[data-sheet="open"] #sheet {
  background: var(--glass-bg);
  border-top-color: var(--glass-border);
  box-shadow: 0 -20px 60px -20px rgb(0 0 0 / 0.45);
  backdrop-filter: blur(28px) saturate(1.3);
  transform: translateY(var(--drag-offset, 0px));
}

#sheet.is-dragging,
#sheet.no-transition {
  transition: none;
}

#sheet-handle {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex: none;
  width: 100%;
  height: var(--sheet-peek);
  padding: 10px 0 0;
  background: transparent;
  color: rgb(255 255 255 / 0.8);
  border: none;
  font: inherit;
  font-size: 12px;
  letter-spacing: 0.04em;
  cursor: grab;
  touch-action: none;
}

.sheet-grip {
  width: 44px;
  height: 5px;
  background: currentColor;
  border-radius: 3px;
}

body[data-sheet="open"] #sheet-handle {
  height: 24px;
  color: var(--text-muted);
}

body[data-sheet="open"] .sheet-handle-label {
  display: none;
}

#sheet-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  visibility: hidden;
  transition: visibility 0s linear 0.3s;
}

body[data-sheet="open"] #sheet-body {
  visibility: visible;
  transition: none;
}
```

Append to `css/start.css`:

```css
#start {
  transition: filter 0.3s ease, opacity 0.3s ease, transform 0.3s ease;
}

body[data-sheet="open"] #start {
  filter: blur(6px);
  opacity: 0.55;
  transform: scale(0.98);
}
```

- [ ] **Step 7: Implement `js/sheet.js`**

```js
import { $ } from "./ui.js";
import { wheelAction } from "./lib/wheel.js";
import { getSettings } from "./settings-store.js";

const DRAG_THRESHOLD_PX = 60;
const CLICK_SLOP_PX = 4;

let open = false;
let lastWheelAt = -Infinity;
let drag = null; // { startY, dy, moved } while the handle is held

export function isSheetOpen() {
  return open;
}

function apply() {
  document.body.dataset.sheet = open ? "open" : "closed";
  $("sheet-handle").setAttribute("aria-expanded", String(open));
  $("sheet-body").inert = !open;
  $("start").inert = open;
}

export function setSheetOpen(next, { focus = true } = {}) {
  if (next === open) {
    return;
  }
  open = next;
  apply();
  if (focus) {
    (open ? $("search-input") : $("sheet-handle")).focus({ preventScroll: true });
  }
}

function initHandle() {
  const handle = $("sheet-handle");
  const sheet = $("sheet");

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    drag = { startY: event.clientY, dy: 0, moved: false };
    handle.setPointerCapture(event.pointerId);
    sheet.classList.add("is-dragging");
  });

  handle.addEventListener("pointermove", (event) => {
    if (!drag) {
      return;
    }
    drag.dy = event.clientY - drag.startY;
    drag.moved = drag.moved || Math.abs(drag.dy) > CLICK_SLOP_PX;
    sheet.style.setProperty("--drag-offset", `${drag.dy}px`);
  });

  const endDrag = (cancelled) => {
    if (!drag) {
      return;
    }
    const { dy, moved } = drag;
    drag = null;
    sheet.classList.remove("is-dragging");
    sheet.style.removeProperty("--drag-offset");
    if (cancelled) {
      return;
    }
    if (!moved) {
      setSheetOpen(!open);
    } else if (!open && dy < -DRAG_THRESHOLD_PX) {
      setSheetOpen(true);
    } else if (open && dy > DRAG_THRESHOLD_PX) {
      setSheetOpen(false);
    }
  };
  handle.addEventListener("pointerup", () => endDrag(false));
  handle.addEventListener("pointercancel", () => endDrag(true));

  // Enter/Space produce a click with detail 0; pointer clicks are handled above.
  handle.addEventListener("click", (event) => {
    if (event.detail === 0) {
      setSheetOpen(!open);
    }
  });
}

function initWheel() {
  window.addEventListener("wheel", (event) => {
    const now = performance.now();
    const action = wheelAction({ open, deltaY: event.deltaY, scrollTop: $("sheet-body").scrollTop, now, lastWheelAt });
    lastWheelAt = now;
    if (!action || document.querySelector("dialog[open]")) {
      return;
    }
    setSheetOpen(action === "open", { focus: false });
  }, { passive: true });
}

function initOutsideClick() {
  // The start page is inert while the sheet is open, so clicks on the strip
  // of photo above the sheet land on <body> or the backdrop.
  document.addEventListener("click", (event) => {
    if (open && !event.target.closest("#sheet, dialog, #toast-region")) {
      setSheetOpen(false);
    }
  });
}

export function initSheet() {
  const sheet = $("sheet");
  if (getSettings().openSheetOnStart) {
    // Open without animating on page load.
    sheet.classList.add("no-transition");
    open = true;
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.remove("no-transition")));
  }
  apply();
  initHandle();
  initWheel();
  initOutsideClick();
}
```

- [ ] **Step 8: Extend `js/shortcuts.js`**

Replace the file with:

```js
import { $, isTypingTarget } from "./ui.js";
import { isSheetOpen, setSheetOpen } from "./sheet.js";

function focusSearchField() {
  const field = isSheetOpen() ? $("search-input") : $("start-search");
  if (field.closest("[hidden]")) {
    return;
  }
  field.focus();
}

export function initShortcuts() {
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (document.querySelector("dialog[open]")) {
      return;
    }
    const typing = isTypingTarget(event.target);

    if (event.key === "/" && !typing) {
      event.preventDefault();
      focusSearchField();
    } else if (event.key === "ArrowDown" && !typing && !isSheetOpen()) {
      event.preventDefault();
      setSheetOpen(true);
    } else if (event.key === "Escape" && isSheetOpen()) {
      event.preventDefault();
      setSheetOpen(false);
    }
  });
}
```

In `js/main.js`, import `initSheet` and call it before `initShortcuts();`.

- [ ] **Step 9: Browser check (includes Review Focus 3)**

Reload with the stub:
1. On load, only the start page shows, with "Bookmarks" and a grip at the bottom edge. The manager is not visible and the Tab key never reaches manager controls.
2. Click the handle: the sheet slides up, the start page blurs behind it, and focus is in `#search-input`.
3. Press Esc: the sheet closes and focus is on the handle. Press Enter: it opens.
4. Close it, then press ↓ (focus on body): it opens. Close it, then `browser_run_code_unsafe` with `await page.mouse.wheel(0, 200)`: it opens. Run `await page.mouse.wheel(0, -200)` immediately after: it stays open (same gesture). Wait 300 ms and wheel −200 again: it closes.
5. Drag the handle up 150 px with the mouse (`page.mouse.move/down/move/up`): it opens. Drag it down 150 px: it closes.
6. Open it and click the photo strip above the sheet: it closes.
7. **Review Focus 3:** focus the start search, type `/a` then press ↓: the text reads `/a` and the sheet stays closed. Open the sheet, type `/x` into a note textarea: the text is `/x`, focus stays in the note and the sheet stays open. Type `/` in `#search-input`: it is typed.
8. All manager actions from the Task 2 check still work inside the sheet (add, edit, note, list view, drag a bookmark into "Work").
9. Run `updateSettings({ openSheetOnStart: true })` and reload: the page opens with the sheet up and no slide animation.
10. **Contrast:** set `bundledPhotos` and run `nextPhoto()` until the brightest bundled photo shows. Open the sheet and take screenshots in light and dark (`browser_emulate_media`). Bookmark titles, URLs (`--text-muted`) and note placeholders must be clearly readable. If any are hard to read, raise `--glass-bg` alpha in steps of 0.06 (up to 0.9) until they are, and record the final values.

- [ ] **Step 10: Commit**

```bash
git add js css newtab.html test
git commit -m "Move the bookmark manager into a pull-up glass sheet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Settings panel

**Files:**
- Create: `js/settings-panel.js`
- Modify: `newtab.html` (remove old `<details id="settings-panel">` and the header's `#settings-btn`; add the gear and the panel dialog; update the selector comment), `css/settings.css` (rewrite), `js/main.js`

**Interfaces:**
- Consumes: `getSettings`, `updateSettings`, `subscribe` (Task 4); `nextPhoto` (Task 5); `initCssEditor` and its element IDs (Task 2); setting key names from `Settings` (Task 4).
- Produces:
  - `js/settings-panel.js`: `export function initSettingsPanel()`.
  - DOM: `#settings-btn` (start page, top-right), `dialog#settings-panel`, `.settings-section`, `[data-setting="<key>"]` controls, `#photos-block` (empty container filled in Task 11), `#css-editor`, `#save-style-btn`, `#reset-style-btn`, `#settings-status` (same IDs as before).

- [ ] **Step 1: Replace the old settings markup**

In `newtab.html`:
- Delete the `<button … id="settings-btn" …>` from `.header-actions`.
- Delete the whole `<details id="settings-panel">…</details>`.
- In `#start`, before `.start-center`, add:

```html
    <button type="button" id="settings-btn" class="start-corner-btn" aria-label="Settings" title="Settings">
      <span class="icon-slot" data-icon="sliders"></span>
    </button>
```

- Before `<dialog id="edit-dialog" …>`, add:

```html
  <dialog id="settings-panel" aria-labelledby="settings-title">
    <div class="settings-scroll">
      <div class="settings-header">
        <h2 id="settings-title">Settings</h2>
        <button type="button" id="settings-close" class="icon-btn" aria-label="Close settings" title="Close"><span class="icon-slot" data-icon="x"></span></button>
      </div>

      <section class="settings-section" aria-labelledby="settings-bg-title">
        <h3 id="settings-bg-title">Background</h3>
        <label class="setting-row"><span>Bundled photos</span><input type="checkbox" data-setting="bundledPhotos"></label>
        <label class="setting-row"><span>Change photo</span>
          <select data-setting="photoFrequency">
            <option value="every-tab">Every new tab</option>
            <option value="hourly">Every hour</option>
            <option value="daily">Every day</option>
          </select>
        </label>
        <div class="setting-row"><span>Photo</span>
          <button type="button" id="next-photo" class="btn btn-small"><span class="icon-slot" data-icon="skip"></span>Next photo</button>
        </div>
        <label class="setting-row"><span>Darken <output id="darken-value"></output></span>
          <input type="range" min="0" max="60" step="5" data-setting="darken">
        </label>
        <div id="photos-block"></div>
      </section>

      <section class="settings-section" aria-labelledby="settings-clock-title">
        <h3 id="settings-clock-title">Clock &amp; greeting</h3>
        <label class="setting-row"><span>Show clock</span><input type="checkbox" data-setting="showClock"></label>
        <label class="setting-row"><span>Show date</span><input type="checkbox" data-setting="showDate"></label>
        <label class="setting-row"><span>Show greeting</span><input type="checkbox" data-setting="showGreeting"></label>
        <label class="setting-row"><span>Time format</span>
          <select data-setting="timeFormat">
            <option value="auto">Automatic</option>
            <option value="12h">12-hour</option>
            <option value="24h">24-hour</option>
          </select>
        </label>
        <label class="setting-row"><span>Your name</span><input type="text" maxlength="40" placeholder="Optional" data-setting="name" autocomplete="off"></label>
      </section>

      <section class="settings-section" aria-labelledby="settings-search-title">
        <h3 id="settings-search-title">Search</h3>
        <label class="setting-row"><span>Show search box</span><input type="checkbox" data-setting="showSearch"></label>
        <label class="setting-row"><span>Suggest matching bookmarks</span><input type="checkbox" data-setting="searchSuggestions"></label>
      </section>

      <section class="settings-section" aria-labelledby="settings-sites-title">
        <h3 id="settings-sites-title">Top sites</h3>
        <label class="setting-row"><span>Number of sites <output id="top-sites-count-value"></output></span>
          <input type="range" min="0" max="12" step="1" data-setting="topSitesCount">
        </label>
        <div class="setting-row" id="restore-top-sites-row"><span>Hidden sites</span>
          <button type="button" id="restore-top-sites" class="btn btn-small">Restore hidden sites</button>
        </div>
      </section>

      <section class="settings-section" aria-labelledby="settings-bookmarks-title">
        <h3 id="settings-bookmarks-title">Bookmarks</h3>
        <label class="setting-row"><span>Open new tabs with bookmarks showing</span><input type="checkbox" data-setting="openSheetOnStart"></label>
      </section>

      <section class="settings-section" aria-labelledby="settings-css-title">
        <h3 id="settings-css-title">Custom CSS</h3>
        <p class="selector-reference">
          Selectors:
          <code>#start</code> <code>#clock</code> <code>#date-line</code> <code>#start-search</code>
          <code>#top-sites</code> <code>.top-site</code> <code>#backdrop</code> <code>#sheet</code>
          <code>#sheet-handle</code> <code>#bookmark-list</code> <code>[data-view="grid"]</code>
          <code>[data-view="list"]</code> <code>.bookmark-item</code> <code>.bookmark-avatar</code>
          <code>.bookmark-title</code> <code>.bookmark-url</code> <code>.bookmark-note</code>
          <code>.bookmark-folder-group</code> <code>#settings-panel</code>.
          Override variables such as <code>--accent</code>, <code>--glass-bg</code> or <code>--radius</code> on <code>:root</code>.
          Press Ctrl+S (Cmd+S on Mac) in the editor to save.
        </p>
        <textarea id="css-editor" spellcheck="false" aria-label="Custom CSS" placeholder=":root { --accent: #e11d48; }&#10;#clock { font-weight: 600; }"></textarea>
        <div class="settings-actions">
          <button type="button" id="save-style-btn" class="btn btn-primary">Save Style</button>
          <button type="button" id="reset-style-btn" class="btn">Reset Style</button>
          <span id="settings-status" role="status"></span>
        </div>
      </section>
    </div>
  </dialog>
```

- In the selector comment at the top of `newtab.html`: remove the `#settings-btn` and `#settings-panel` (`<details>`) lines, and add:

```
      #backdrop                   Fixed photo layer (.backdrop-image children; ::after is the darken overlay)
      #start                      Start page; contains #settings-btn, #clock, #date-line, #start-search, #top-sites, #photo-credit
      .top-site, .top-site-icon, .top-site-letter, .top-site-title, .top-site-hide
      #search-suggestions .suggestion   Bookmark suggestions under the start search
      #sheet, #sheet-handle, #sheet-body   Bottom sheet; body[data-sheet="open"|"closed"]
      #settings-panel             Settings dialog (.settings-section, .setting-row)
      #css-editor                 Custom CSS textarea
```

  Also add `--glass-bg, --glass-border, --darken` to the theme-variable list.

- [ ] **Step 2: Rewrite `css/settings.css`**

```css
/* ---- Start page settings button ---- */

.start-corner-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  background: rgb(255 255 255 / 0.16);
  color: #ffffff;
  border: 1px solid rgb(255 255 255 / 0.28);
  border-radius: 50%;
  cursor: pointer;
  backdrop-filter: blur(12px);
  transition: background-color 0.15s ease;
}

.start-corner-btn:hover {
  background: rgb(255 255 255 / 0.28);
}

/* ---- Settings panel ---- */

#settings-panel {
  position: fixed;
  inset: 0 0 0 auto;
  width: min(420px, 100vw);
  max-width: none;
  height: 100vh;
  max-height: none;
  margin: 0;
  padding: 0;
  background: var(--glass-bg);
  color: var(--text);
  border: none;
  border-left: 1px solid var(--glass-border);
  border-radius: 22px 0 0 22px;
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(28px) saturate(1.3);
}

#settings-panel[open] {
  animation: settings-in 0.25s ease-out;
}

#settings-panel::backdrop {
  background: rgb(0 0 0 / 0.2);
}

#settings-panel.is-file-over {
  box-shadow: inset 0 0 0 3px var(--accent), var(--shadow-lg);
}

@keyframes settings-in {
  from {
    opacity: 0;
    transform: translateX(24px);
  }
}

.settings-scroll {
  height: 100%;
  overflow-y: auto;
  padding: 18px 22px 28px;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.settings-header h2 {
  margin: 0;
  font-size: 18px;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 0;
  border-top: 1px solid var(--border);
}

.settings-section h3 {
  margin: 0 0 6px;
  color: var(--text-muted);
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 36px;
}

.setting-row input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
}

.setting-row input[type="range"] {
  width: 150px;
  accent-color: var(--accent);
}

.setting-row select,
.setting-row input[type="text"] {
  width: 170px;
  height: 34px;
  padding: 0 10px;
  background: var(--surface-2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 9px;
  font: inherit;
}

.setting-row output {
  color: var(--text-muted);
  font-size: 12px;
}

.btn-small {
  height: 32px;
  padding: 0 12px;
  font-size: 13px;
}

#css-editor {
  width: 100%;
  min-height: 200px;
  padding: 12px;
  resize: vertical;
  background: var(--surface-2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: var(--mono);
  font-size: 13px;
  tab-size: 2;
}

#css-editor:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.settings-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

#settings-status {
  color: var(--text-muted);
}

.selector-reference {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.9;
}

.selector-reference code {
  padding: 2px 6px;
  background: var(--surface-2);
  color: var(--accent);
  border-radius: 5px;
  font-family: var(--mono);
}
```

- [ ] **Step 3: Implement `js/settings-panel.js`**

```js
import { $ } from "./ui.js";
import { nextPhoto } from "./background.js";
import { getSettings, updateSettings, subscribe } from "./settings-store.js";

function readControl(control) {
  if (control.type === "checkbox") {
    return control.checked;
  }
  if (control.type === "range") {
    return Number(control.value);
  }
  return control.value;
}

function writeControl(control, value) {
  // Don't rewrite a text box while someone is typing in it.
  if (control.type === "text" && document.activeElement === control) {
    return;
  }
  if (control.type === "checkbox") {
    control.checked = value;
  } else {
    control.value = String(value);
  }
}

function render(settings) {
  for (const control of $("settings-panel").querySelectorAll("[data-setting]")) {
    writeControl(control, settings[control.dataset.setting]);
  }
  $("darken-value").textContent = `${settings.darken}%`;
  $("top-sites-count-value").textContent = String(settings.topSitesCount);
  $("restore-top-sites-row").hidden = settings.hiddenTopSites.length === 0;
}

export function initSettingsPanel() {
  const panel = $("settings-panel");

  $("settings-btn").addEventListener("click", () => panel.showModal());
  $("settings-close").addEventListener("click", () => panel.close());
  // The dialog has no padding, so a click on the dialog element itself is a click on the backdrop.
  panel.addEventListener("click", (event) => {
    if (event.target === panel) {
      panel.close();
    }
  });

  for (const control of panel.querySelectorAll("[data-setting]")) {
    const eventName = control.type === "text" || control.type === "range" ? "input" : "change";
    control.addEventListener(eventName, () => {
      updateSettings({ [control.dataset.setting]: readControl(control) });
    });
  }

  $("restore-top-sites").addEventListener("click", () => updateSettings({ hiddenTopSites: [] }));
  $("next-photo").addEventListener("click", () => nextPhoto());

  render(getSettings());
  subscribe(render);
}
```

- [ ] **Step 4: Update `js/main.js`**

Delete `initLegacySettingsToggle` and its call. Import `initSettingsPanel` and call it after `initCssEditor(initialCss);`. Remove `$` from the `ui.js` import if it is no longer used.

- [ ] **Step 5: Browser check**

Reload with the stub. The start page shows the round settings button in the top-right; the manager header no longer has one.
1. Click it: the panel slides in from the right and every control shows its default (Bundled photos on, Every day, Darken 25%, 8 sites, and so on). "Hidden sites" is not shown.
2. Type `Jon` in "Your name": the greeting updates with each keystroke and the cursor never jumps.
3. Untick "Show clock": the clock hides immediately. Change "Time format": the clock format updates.
4. Drag Darken to 60: the photo behind darkens and the label reads 60%.
5. Click **Next photo**: the photo changes.
6. Close with Esc, reopen, and click the dimmed area left of the panel: it closes.
7. Hide a top site with ×, reopen settings: "Restore hidden sites" shows. Click it: the site returns and the row hides.
8. Type CSS in the editor and press Ctrl+S: "Style saved." appears and the style applies. **Reset Style** opens the confirm dialog on top of the panel; confirm it: the style is removed.
9. Tick "Open new tabs with bookmarks showing", then reload: the sheet is open on load.
10. At 375 px wide, the panel fills the width and nothing overflows horizontally.

- [ ] **Step 6: Commit**

```bash
git add js css newtab.html
git commit -m "Add settings panel to the start page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: User photos in IndexedDB

**Files:**
- Create: `js/lib/image-size.js`, `js/image-store.js`, `js/settings-photos.js`
- Test: `test/lib/image-size.test.js`
- Modify: `newtab.html` (`#photos-block` contents), `css/settings.css`, `js/main.js`

**Interfaces:**
- Consumes: `setUserPhotoSource`, `refreshBackground` (Task 5); `showToast`, `createIcon("x")` (Task 2); `#photos-block`, `#settings-panel` (Task 10).
- Produces:
  - `js/lib/image-size.js`: `export const MAX_PHOTO_EDGE = 2560`, `export const THUMB_EDGE = 256`, `export function fitWithin(width: number, height: number, maxEdge: number): { width: number, height: number }` (throws on non-positive or non-finite sizes).
  - `js/image-store.js`: `export async function isAvailable(): Promise<boolean>`, `export function listPhotos(): Promise<Record[]>` (sorted oldest first), `export function listPhotoIds(): Promise<string[]>`, `export async function getPhotoBlob(id): Promise<Blob|null>`, `export function addPhoto(record): Promise<void>`, `export function deletePhoto(id): Promise<void>`, `export async function preparePhoto(file: File): Promise<Record>`, where `Record = { id: string, blob: Blob, thumb: Blob, addedAt: number }`.
  - `js/settings-photos.js`: `export async function initPhotoSettings()`.

- [ ] **Step 1: Write the failing test**

`test/lib/image-size.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { fitWithin, MAX_PHOTO_EDGE, THUMB_EDGE } from "../../js/lib/image-size.js";

test("limits match the spec", () => {
  assert.equal(MAX_PHOTO_EDGE, 2560);
  assert.equal(THUMB_EDGE, 256);
});

test("small images are never upscaled", () => {
  assert.deepEqual(fitWithin(800, 600, 2560), { width: 800, height: 600 });
});

test("landscape is limited by width, keeping the aspect ratio", () => {
  assert.deepEqual(fitWithin(8000, 4000, 2560), { width: 2560, height: 1280 });
});

test("portrait is limited by height", () => {
  assert.deepEqual(fitWithin(3000, 6000, 2560), { width: 1280, height: 2560 });
});

test("huge panoramas never shrink a side below 1 px (Review Focus 4)", () => {
  assert.deepEqual(fitWithin(40000, 10, 256), { width: 256, height: 1 });
});

test("zero, negative or NaN sizes throw", () => {
  for (const [width, height] of [[0, 10], [10, -1], [Number.NaN, 10], [Infinity, 10]]) {
    assert.throws(() => fitWithin(width, height, 256), /no size/);
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `js/lib/image-size.js`**

```js
export const MAX_PHOTO_EDGE = 2560;
export const THUMB_EDGE = 256;

// Scales a size down (never up) so its longest side is at most maxEdge.
export function fitWithin(width, height, maxEdge) {
  if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)) {
    throw new Error("Image has no size.");
  }
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Implement `js/image-store.js`**

```js
import { fitWithin, MAX_PHOTO_EDGE, THUMB_EDGE } from "./lib/image-size.js";

const DB_NAME = "newtab-images";
const DB_VERSION = 1;
const STORE_NAME = "photos";
const WEBP_QUALITY = 0.85;

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    // Let a later call try again instead of caching the failure.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

async function run(mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function isAvailable() {
  try {
    await openDb();
    return true;
  } catch {
    return false;
  }
}

export async function listPhotos() {
  const records = await run("readonly", (store) => store.getAll());
  return records.sort((a, b) => a.addedAt - b.addedAt);
}

export function listPhotoIds() {
  return run("readonly", (store) => store.getAllKeys());
}

export async function getPhotoBlob(id) {
  const record = await run("readonly", (store) => store.get(id));
  return record ? record.blob : null;
}

export function addPhoto(record) {
  return run("readwrite", (store) => store.put(record));
}

export function deletePhoto(id) {
  return run("readwrite", (store) => store.delete(id));
}

async function encode(bitmap, maxEdge) {
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  return canvas.convertToBlob({ type: "image/webp", quality: WEBP_QUALITY });
}

// Decodes, downscales and re-encodes an uploaded file. Throws if it isn't a
// decodable image.
export async function preparePhoto(file) {
  const bitmap = await createImageBitmap(file);
  try {
    return {
      id: crypto.randomUUID(),
      blob: await encode(bitmap, MAX_PHOTO_EDGE),
      thumb: await encode(bitmap, THUMB_EDGE),
      addedAt: Date.now()
    };
  } finally {
    bitmap.close();
  }
}
```

- [ ] **Step 6: Markup and styles**

Fill `#photos-block` in `newtab.html`:

```html
        <div id="photos-block">
          <div class="setting-row"><span>Your photos</span>
            <label class="btn btn-small" for="photo-input" id="photo-add"><span class="icon-slot" data-icon="plus"></span>Add photos</label>
            <input id="photo-input" type="file" accept="image/*" multiple hidden>
          </div>
          <p id="photos-unavailable" class="setting-hint" hidden>Not available in this window.</p>
          <p class="setting-hint">You can also drop images onto this panel.</p>
          <ul id="photo-grid" class="photo-grid"></ul>
        </div>
```

Append to `css/settings.css`:

```css
.setting-hint {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
  gap: 8px;
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}

.photo-grid:empty {
  display: none;
}

.photo-thumb {
  position: relative;
  aspect-ratio: 4 / 3;
  background-position: center;
  background-size: cover;
  border-radius: 10px;
}

.photo-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  background: rgb(0 0 0 / 0.6);
  color: #ffffff;
  border: none;
  border-radius: 50%;
  font-size: 11px;
  cursor: pointer;
}
```

- [ ] **Step 7: Implement `js/settings-photos.js`**

```js
import { $, createElement, createIcon, showToast } from "./ui.js";
import * as images from "./image-store.js";
import { refreshBackground, setUserPhotoSource } from "./background.js";

let thumbUrls = [];

async function renderGrid() {
  const records = await images.listPhotos();
  thumbUrls.forEach((url) => URL.revokeObjectURL(url));
  thumbUrls = [];

  $("photo-grid").replaceChildren(...records.map((record) => {
    const url = URL.createObjectURL(record.thumb);
    thumbUrls.push(url);
    const item = createElement("li", "photo-thumb");
    item.style.backgroundImage = `url("${url}")`;

    const remove = createElement("button", "photo-remove");
    remove.type = "button";
    remove.title = "Delete photo";
    remove.setAttribute("aria-label", "Delete photo");
    remove.append(createIcon("x"));
    remove.addEventListener("click", async () => {
      try {
        await images.deletePhoto(record.id);
        await renderGrid();
        await refreshBackground();
      } catch (error) {
        console.error("Failed to delete photo:", error);
        showToast("Couldn't delete photo", "error");
      }
    });

    item.append(remove);
    return item;
  }));
}

// Adds each file on its own, so one bad file doesn't stop the rest.
async function addFiles(files) {
  let added = 0;
  for (const file of files) {
    try {
      await images.addPhoto(await images.preparePhoto(file));
      added += 1;
    } catch (error) {
      console.error(`Failed to add ${file.name}:`, error);
      const message = error && error.name === "QuotaExceededError"
        ? `Not enough space for ${file.name}`
        : `Couldn't add ${file.name}`;
      showToast(message, "error");
    }
  }
  if (added > 0) {
    showToast(added === 1 ? "Added 1 photo" : `Added ${added} photos`, "success");
    await renderGrid();
    await refreshBackground();
  }
}

function initDropTarget(panel) {
  const hasFiles = (event) => [...event.dataTransfer.types].includes("Files");
  panel.addEventListener("dragover", (event) => {
    if (hasFiles(event)) {
      event.preventDefault();
      panel.classList.add("is-file-over");
    }
  });
  panel.addEventListener("dragleave", (event) => {
    if (event.target === panel) {
      panel.classList.remove("is-file-over");
    }
  });
  panel.addEventListener("drop", (event) => {
    if (!hasFiles(event)) {
      return;
    }
    event.preventDefault();
    panel.classList.remove("is-file-over");
    addFiles([...event.dataTransfer.files]);
  });
}

export async function initPhotoSettings() {
  if (!(await images.isAvailable())) {
    $("photos-unavailable").hidden = false;
    $("photo-add").hidden = true;
    return;
  }

  setUserPhotoSource({ listIds: images.listPhotoIds, load: images.getPhotoBlob });

  const input = $("photo-input");
  input.addEventListener("change", () => {
    const files = [...input.files];
    input.value = "";
    addFiles(files);
  });
  initDropTarget($("settings-panel"));

  try {
    await renderGrid();
  } catch (error) {
    console.error("Failed to list photos:", error);
  }
  await refreshBackground();
}
```

- [ ] **Step 8: Wire into `js/main.js` and run the browser check (includes Review Focus 4)**

Import `initPhotoSettings` and call it without `await` right after `initSettingsPanel();`.

Create the test files with a small script so the check is repeatable:

```bash
cd /c/dev/Homepage/.playwright-mcp && printf 'not an image' > bad.txt && printf 'garbage' > broken.jpg
```

For the good image, any bundled photo will do: `C:/dev/Homepage/backgrounds/01.webp`.

Reload with the stub and open Settings:
1. Click **Add photos** and choose `01.webp`, `bad.txt` and `broken.jpg` together (`browser_file_upload`). Expected: toasts "Couldn't add bad.txt" and "Couldn't add broken.jpg", plus "Added 1 photo"; one thumbnail appears.
2. Untick **Bundled photos**: the background becomes the uploaded photo (the only one in the pool) and the credit is empty.
3. Reload with the stub. The thumbnail is still in Settings, because IndexedDB persists on this origin. The stub's in-memory storage resets, so "Bundled photos" is back on; untick it again and the uploaded photo becomes the background.
4. Click × on the thumbnail: the grid empties and the background falls back to the gradient.
5. In `browser_evaluate`, check that a large image is downscaled: `const c = new OffscreenCanvas(6000, 3000); const b = await c.convertToBlob({ type: "image/png" }); const m = await import("/js/image-store.js"); const r = await m.preparePhoto(new File([b], "big.png")); const bm = await createImageBitmap(r.blob); [bm.width, bm.height]` → `[2560, 1280]`.

- [ ] **Step 9: Commit**

```bash
git add js css newtab.html test
git commit -m "Let users add their own background photos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Manifest, README and final verification

**Files:**
- Modify: `manifest.json`, `README.md`

- [ ] **Step 1: Manifest**

Set `"version": "2.0.0"`. Set `"description"` to `"A calm start page with a photo, clock, search and your most visited sites, plus your bookmarks one swipe away: grid and folder views, notes and custom CSS."` Confirm `"permissions": ["bookmarks", "storage", "search", "topSites", "favicon"]`.

- [ ] **Step 2: README**

Update `README.md`:
- **Features:** lead with the start page: rotating background photos (12 bundled, plus your own, changed every tab, hourly or daily), clock with date and greeting, a search box that uses your browser's default search engine and suggests matching bookmarks, and your most visited sites. Then the bookmark manager: pull up the handle at the bottom, scroll down, or press ↓; Esc closes it. Keep the existing manager bullets. Mention the Settings button in the top-right corner.
- **Custom styling:** say that the CSS editor is now in Settings. Replace the selector table with: `#start`, `#clock`, `#date-line`, `#start-search`, `#top-sites` / `.top-site`, `#backdrop`, `#sheet` / `#sheet-handle`, `#bookmark-list[data-view=…]`, `.bookmark-item`, `.bookmark-avatar`, `.bookmark-title` / `.bookmark-url` / `.bookmark-note`, `#settings-panel`. Add `--glass-bg` and `--darken` to the variables example.
- **Permissions table:** add `search` ("Search with your browser's default search engine from the start page"), `topSites` ("Show your most visited sites"), `favicon` ("Chrome only: show site icons from Chrome's own local icon cache"). Update `storage` to "Save notes, settings, the chosen view, folder state and custom CSS". Add a sentence: "Photos you add are stored in the browser's IndexedDB on your machine."
- **Install in Firefox:** add "Firefox shows a warning that `favicon` is an unknown permission. It's Chrome-only and the warning is harmless." Add to the signing step: `--ignore-files "test/**" "docs/**" package.json`.
- **Updating from 1.x:** "Chrome asks you to approve the new permissions after an update. Your bookmarks, notes and custom CSS carry over."

- [ ] **Step 3: Full unit test run**

Run: `npm test`
Expected: all tests PASS, 0 failures.

- [ ] **Step 4: Full browser pass with the stub**

Reload with the stub and run the Task 9 Step 9 check and the Task 10 Step 5 check again, end to end. Then run `browser_console_messages`: expect no errors apart from the deliberate `_favicon` image 404s.

- [ ] **Step 5: Manual check in real browsers** (human, or the session with the user's help)

Chrome: `chrome://extensions` → reload the unpacked extension → open a new tab.
- [ ] A photo shows on the first frame; the credit is correct.
- [ ] Real favicons show for top sites.
- [ ] A search runs on the default engine; `example.com` opens the site.
- [ ] Suggestions show real bookmarks.
- [ ] The sheet opens and closes with the handle, the trackpad, ↓ and Esc.
- [ ] Adding a photo works and survives a browser restart.

Firefox 128+: `about:debugging` → Load Temporary Add-on → `manifest.json` → open a new tab.
- [ ] Same items as Chrome, except the top sites use letter tiles.
- [ ] The `favicon` warning appears and nothing else is broken.

- [ ] **Step 6: Commit**

```bash
git add manifest.json README.md
git commit -m "Document the start page and bump version to 2.0.0

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
