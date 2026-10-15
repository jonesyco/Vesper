# Start page redesign — design

Date: 2026-10-14
Status: Draft for review

## Goal

Give NewTab the calm, photo-first appeal of Bonjourr while keeping every
bookmark-manager feature. Opening a new tab shows a start page (photo, clock,
greeting, search, most-visited sites). The full bookmark manager lives in a
bottom sheet over the same blurred photo.

**Success looks like:** a new tab feels like Bonjourr at first glance; the
manager is one gesture away and behaves exactly as it does today; nothing
leaves the machine; it still installs with "Load unpacked" and no build step.

### Decisions made during brainstorming

| Topic | Decision |
| --- | --- |
| Priority | Start page first; manager on demand |
| Backgrounds | Bundled photos + user-uploaded photos (no network) |
| Start-page widgets | Clock, date + greeting, search (no weather, quotes or notes) |
| Manager access | Bottom sheet pulled up from a fixed bottom-edge handle |
| Start-page layout | Centered stack: clock, date/greeting, search, top-site icons |
| Code structure | Plain ES modules and split stylesheets, no build step |

### Out of scope

Weather, quotes, start-page notes, online photo sources (Unsplash API),
configurable sheet edge, any bundler or framework.

## 1. Start page

### Background

- About 12 landscape photos ship in `backgrounds/` (WebP, ~1920 px wide,
  ~4 MB total), taken from Unsplash or Pexels under their free licences.
  Each has a credit (photographer name) listed in `js/lib/bundled-photos.js`
  and shown small in the bottom-right corner. User photos show no credit.
- **Pool:** the user's photos, plus the bundled photos unless
  "Bundled photos" is off. An empty pool shows a calm CSS gradient.
- **Rotation:** `every-tab`, `hourly`, or `daily` (default `daily`). The
  current pick and the time it was picked are stored in `storage.local`
  (`background_state`); a new pick happens when the period has rolled over.
  A new pick never repeats the previous photo when the pool has more than
  one. "Next photo" forces a new pick.
- **Darken overlay:** a dark gradient whose strength is the "Darken" setting
  (0–60 %, default 25 %).
- **No flash:** the last bundled photo's path is cached in `localStorage`
  and applied by the first lines of `main.js`, before anything else runs
  (MV3 forbids inline scripts, so it can't go in the HTML). User photos are read from IndexedDB (fast) and the
  image fades in over the gradient.

### Clock, date and greeting

- Clock: hours and minutes. Format `auto` (follows locale via
  `Intl.DateTimeFormat`), `12h`, or `24h`. Updates on the minute boundary
  (a timer aligned to the next minute, not a 1-second interval).
- Date line: `Tuesday 14 October · Good morning, Jon`, using the locale's
  long date format.
- Greeting by local hour: morning 5–11, afternoon 12–16, evening 17–21,
  night otherwise. Name optional; without it, "Good morning".
- Clock, date and greeting can each be turned off.

### Search

- Enter: if the text looks like an address (`example.com`,
  `https://…`, `localhost:3000`), open it in the current tab, reusing the
  existing `normalizeUrl`. Otherwise search with the browser's default engine
  via `search.query({ text, disposition: "CURRENT_TAB" })`.
- While typing, a dropdown lists up to 5 matching bookmarks, using the
  manager's existing title/URL/note matching. Arrow keys move the selection;
  Enter opens the selected bookmark; Esc closes the dropdown.
- `/` focuses the search box when the sheet is closed.
- The search box and the bookmark suggestions can each be turned off.

### Top sites

- A row of the most visited sites from `topSites.get()`, excluding any the
  user has hidden. Count 0–12 (default 8); 0 hides the row.
- Icons: in Chrome, the real favicon from the built-in
  `/_favicon/?pageUrl=…&size=64` service (needs the `favicon` permission;
  served locally). In Firefox, which has no such service, the existing
  coloured letter tile.
- Hovering an icon shows a × that hides that site. Hidden URLs are stored in
  `settings.hiddenTopSites`; Settings offers "Restore hidden sites".

## 2. Bottom sheet and manager

### Sheet behaviour

- **Closed:** a handle and a faint "Bookmarks" label at the bottom edge.
- **Open with:** click or drag the handle upward; wheel/scroll down on the
  start page; `↓` when focus is not in a text field.
- **Close with:** Esc (when no dialog is open); drag the handle down; wheel
  up while the sheet's content is scrolled to the top; click the visible
  strip of photo above the sheet.
- **Open state:** the sheet covers the bottom ~85 % of the viewport; the start
  page behind it is blurred and dimmed.
- **Motion:** a ~300 ms `transform` slide, instant under
  `prefers-reduced-motion`.
- **Setting:** "Open new tabs with bookmarks showing" (default off).
- Focus: opening moves focus to the manager's filter box; closing returns it
  to the handle. The start page is `inert` while the sheet is open, and the
  sheet is `inert` while closed.

### Manager inside the sheet

- Today's header becomes the sheet toolbar: bookmark count, filter box,
  Blocks/List toggle, New folder, Add bookmark.
- Unchanged behaviour: both views, notes, drag-and-drop, folders, editing,
  remembered view and folder open/closed state.
- `/` focuses the manager filter box when the sheet is open.

### Look

- The sheet is frosted glass (`backdrop-filter: blur(…)`) over the same
  photo. Cards, rows, dialogs and toasts become translucent glass. The
  coloured letter tiles stay.
- Light and dark mode still follow the system: pale glass with dark text, or
  smoky glass with light text. Both must meet WCAG AA text contrast over the
  bundled photos; glass opacity is raised until they do.

### Settings removed from the manager

The `<details id="settings-panel">` at the bottom of the manager goes away.
Its CSS editor moves into the new Settings panel.

## 3. Settings panel

A gear in the top-right of the start page opens a glass panel sliding in
from the right. Esc or clicking outside closes it. Changes apply instantly.

| Section | Controls |
| --- | --- |
| Background | Bundled photos (switch); Change photo (every tab / hourly / daily); Next photo; Darken (0–60 %); Your photos: Add photos (multi-file, also drag-and-drop onto the panel), thumbnail grid with delete × |
| Clock & greeting | Show clock, Show date, Show greeting (switches); Time format (auto / 12h / 24h); Your name |
| Search | Show search box; Suggest matching bookmarks |
| Top sites | Number of sites (0–12); Restore hidden sites (only when some are hidden) |
| Bookmarks | Open new tabs with bookmarks showing |
| Custom CSS | Existing editor, Save Style / Reset Style / Ctrl+S, updated selector reference |

Uploaded photos are downscaled to at most 2560 px on the long side and
re-encoded as WebP (quality 0.85) before being stored, with a 256 px
thumbnail stored alongside for the grid.

### Storage

- `settings` (one object in `storage.local`): all values above. Loading
  merges stored values over defaults, so missing keys get defaults and old
  installs upgrade cleanly. Values outside their allowed range fall back to
  the default.
- Existing keys stay as they are: `custom_theme_css`, `view_mode`,
  `collapsed_folders`, `last_folder_id`, `note_*`.
- New keys: `settings`, `background_state`.
- `storage.onChanged` keeps other open new tabs in sync.
- IndexedDB database `newtab-images`, store `photos`:
  `{ id, blob, thumb, addedAt }`.

## 4. Architecture

No build step. `newtab.html` loads `css/*.css` and one
`<script type="module" src="js/main.js">`.

```
newtab.html            markup only
css/base.css           tokens, glass, buttons, fields, dialogs, toasts
css/start.css          background, clock, greeting, search, top sites
css/sheet.css          sheet, handle, manager grid/list
css/settings.css       settings panel
js/main.js             entry: background bootstrap, load settings, init modules
js/api.js              browser/chrome alias, storage get/set, onChanged
js/ui.js               $, createElement, icons, toast, confirm dialog
js/settings-store.js   defaults, load, update(patch), subscribe(fn)
js/image-store.js      IndexedDB add/list/get/delete, resize + thumbnail
js/background.js       pool, rotation, overlay, credit, Next photo
js/start.js            clock, greeting, search + suggestions, top sites
js/sheet.js            open/close, gestures, keys, inert/focus
js/manager.js          existing manager code, exports initManager and
                       searchBookmarks(query, limit)
js/settings-panel.js   panel UI bound to settings-store and image-store
js/lib/*.js            pure logic, no DOM or browser APIs (see Testing)
backgrounds/*.webp     bundled photos
```

Pure logic in `js/lib/`:

- `greeting.js`: `greetingFor(hour)`, `uses12Hour(format, locale)`
- `rotation.js`: `shouldRepick(state, frequency, now)`,
  `pickNext(pool, previousId, random)`
- `url.js`: `normalizeUrl`, `looksLikeUrl` (moved from `newtab.js`)
- `match.js`: `bookmarkMatches` (moved from `newtab.js`)
- `top-sites.js`: `visibleTopSites(sites, hidden, count)`
- `settings-schema.js`: `DEFAULTS`, `mergeSettings(stored)`
- `bundled-photos.js`: list of `{ id, file, credit }`

**Data flow:** `settings-store` is the single source of truth. Modules
subscribe and re-render their own part; `settings-panel` only calls
`update(patch)`. `start.js` gets bookmark suggestions from
`manager.searchBookmarks`, so bookmarks are loaded once.

**Migration order:** first move existing code into modules with no change in
behaviour, and confirm the manager works exactly as before. Then add the new
features on top.

### Manifest

- Version `2.0.0`.
- Add permissions: `topSites`, `search`, `favicon`. Firefox ignores
  `favicon` with a harmless warning; README notes it, as it already does for
  `browser_specific_settings` in Chrome.

## 5. Error handling

| Failure | Behaviour |
| --- | --- |
| `topSites.get()` rejects or returns nothing | Hide the row |
| `search.query` fails | Fall back to a toast "Couldn't search"; text stays in the box |
| IndexedDB unavailable (e.g. some private windows) | "Your photos" section shows "Not available in this window"; bundled photos still work |
| Uploaded file isn't a decodable image | Skip it and toast "Couldn't add <name>"; others still add |
| Storage quota exceeded on upload | Toast "Not enough space for <name>" |
| Stored background no longer exists (deleted photo) | Pick again from the pool |
| Bundled photo fails to load | Pick another; after all fail, show the gradient |
| Favicon fails to load | Swap to the letter tile |
| Corrupt or out-of-range settings | `mergeSettings` falls back to defaults per key |

## 6. Testing

- **Unit tests** for everything in `js/lib/`, with Node's built-in
  `node:test` (`node --test`). No dependencies; a minimal `package.json`
  with `"type": "module"` and a `test` script, and nothing to install.
  Cases cover greeting hour boundaries, rotation roll-over for each
  frequency, no-repeat picks, URL-vs-search detection, top-site
  filtering/count, and settings merge with missing, extra and invalid
  values.
- **Browser check** with Playwright on `newtab.html` served locally with a
  small stub of the `chrome.*` APIs (bookmarks, storage, topSites, search):
  start page renders; sheet opens/closes by handle, wheel and keys; the
  manager's add/edit/delete/move and notes still work; settings changes
  apply live; screenshots in light and dark.
- **Manual check** in real Chrome and Firefox 128+ via Load unpacked /
  Load Temporary Add-on, using a short checklist in the plan, including
  real top sites, favicons and default-engine search.

## 7. Docs

Update `README.md`: features, new permissions (and why), the Settings panel,
the new selectors for custom CSS, and the `favicon` warning in Firefox.
