# NewTab

A browser extension that replaces the New Tab page with a calm start page, with your bookmarks one swipe away. Works in Chrome (and other Chromium browsers such as Edge and Brave) and Firefox.

## Features

### Start page

- **Background photos**: 12 calm landscape photos are included, and you can add your own. The photo changes every new tab, every hour or every day, and **Next photo** skips to another.
- **Clock, date and greeting**: "Good morning, Jon". Set your name and 12/24-hour time in Settings.
- **Search** with your browser's default search engine. Type an address such as `example.com` to go straight there, or start with `?` to always search. Matching bookmarks are suggested as you type. Press `/` to jump to the search box.
- **Most visited sites** as a row of icons (up to 12). Hover an icon and click × to hide a site.
- **Settings** live behind the button in the top-right corner.

### Bookmarks

Pull up the handle at the bottom of the page, scroll down, or press ↓ to open your bookmarks over the blurred photo. Press Esc, pull the handle down, or click the photo above to close them again.

- **Two views**: a colourful card grid sorted A–Z, or an indented folder tree that keeps your own order. The view you choose is remembered for every new tab.
- **Organize**: drag bookmarks and folders onto other folders (List view), or use the edit button's Folder field in either view.
- **Folders**: create, rename and delete folders right on the page.
- **Add bookmarks** by typing a URL. `example.com` is enough, and `https://` is added for you.
- **Notes**: write a private note on any bookmark. Notes save automatically.
- **Filter** titles, URLs and notes. Press `/` while the bookmarks are open to jump to the filter box.
- **Custom CSS**: restyle the whole page from Settings.
- Light and dark mode follow your system setting.

Bookmark changes go straight to your browser's real bookmarks. Notes, settings, custom CSS and your photos are stored locally in the browser and never leave your machine. The page makes no network requests of its own.

## Get the code

Clone the repository:

```sh
git clone https://github.com/jonesyco/NewTab.git
```

Or download it from GitHub with **Code → Download ZIP** and unzip it. Keep the folder somewhere permanent: the browser loads the extension from this folder.

## Install in Chrome

Edge, Brave and other Chromium browsers work the same way. Their extensions pages are `edge://extensions`, `brave://extensions`, and so on.

1. Go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right switch).
3. Click **Load unpacked** and select the `NewTab` folder (the one containing `manifest.json`).
4. Open a new tab. If Chrome asks whether you meant to change the New Tab page, choose **Keep it**.

Chrome may show *Unrecognized manifest key 'browser_specific_settings'* on the extension's card. That key is only for Firefox, and the warning is harmless.

**Updating from 1.x:** Chrome asks you to approve the new permissions after an update. Your bookmarks, notes and custom CSS carry over.

**Updating:** pull or download the new code, then click the reload icon on the extension's card in `chrome://extensions`.

## Install in Firefox

Firefox 128 or newer is required. Firefox shows a warning that `favicon` is an unknown permission. It's Chrome-only and the warning is harmless.

### Quick test (removed when Firefox restarts)

1. Go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select the `manifest.json` file inside the `NewTab` folder.
3. Open a new tab. If Firefox says an extension has changed your New Tab page, choose **Keep Changes**.

**Updating:** click **Reload** next to the extension in `about:debugging`.

### Permanent install

Regular Firefox only keeps add-ons that Mozilla has signed. You can sign it privately, without listing it publicly:

1. Create API credentials at <https://addons.mozilla.org/developers/addon/api/key/>. You'll need a free Firefox account.
2. From the `NewTab` folder, run:

   ```sh
   npx web-ext sign --channel=unlisted --api-key=YOUR_KEY --api-secret=YOUR_SECRET --ignore-files "test/**" "docs/**" package.json
   ```

3. Open the `.xpi` file it creates in `web-ext-artifacts/` with Firefox (drag it into a Firefox window) and confirm the install.

Before signing, change the add-on ID in `manifest.json` (`browser_specific_settings.gecko.id`) from `bookmark-homepage@extension` to something unique to you, such as `newtab@yourdomain.com`.

Firefox Developer Edition, Nightly and ESR can instead install unsigned add-ons: set `xpinstall.signatures.required` to `false` in `about:config`. Then zip the folder's contents and install the zip from `about:addons` → gear menu → **Install Add-on From File…**.

## Custom styling

Open **Settings** (top-right corner of the start page), paste CSS into the **Custom CSS** editor and click **Save Style** (or press Ctrl+S). Your CSS loads after the built-in styles, so it overrides them.

The quickest way to re-theme is to override the colour variables:

```css
:root {
  --accent: #e11d48;
  --accent-2: #f97316;
  --radius: 6px;
  --glass-bg: rgba(20, 20, 30, 0.8); /* the frosted panels */
}
```

Useful selectors:

| Selector | What it styles |
| --- | --- |
| `#start` | The start page |
| `#clock`, `#date-line` | The clock and the date/greeting line |
| `#start-search` | The start page search box |
| `#top-sites`, `.top-site` | The most visited sites row and each icon |
| `#backdrop` | The background photo layer |
| `#sheet`, `#sheet-handle` | The bookmarks sheet and its pull handle |
| `#bookmark-list[data-view="grid"]` / `[data-view="list"]` | The bookmarks in each view |
| `.bookmark-item` | A bookmark card (grid) or row (list) |
| `.bookmark-avatar` | The coloured letter tile |
| `.bookmark-title`, `.bookmark-url`, `.bookmark-note` | Parts of each bookmark |
| `#settings-panel` | The settings panel |

The full list of selectors and variables is in the comment at the top of `newtab.html`. **Reset Style** removes your CSS and restores the default look.

## Permissions

| Permission | Why |
| --- | --- |
| `bookmarks` | Read, add, edit, move and delete your bookmarks |
| `storage` | Save notes, settings, the chosen view, folder state and custom CSS |
| `search` | Search with your browser's default search engine from the start page |
| `topSites` | Show your most visited sites |
| `favicon` | Chrome only: show site icons from Chrome's own local icon cache |

Photos you add are stored in the browser's IndexedDB on your machine.
