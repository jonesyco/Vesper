# NewTab

A browser extension that replaces the New Tab page with your bookmarks. Works in Chrome (and other Chromium browsers such as Edge and Brave) and Firefox.

## Features

- **Two views**: a colourful card grid sorted A–Z, or an indented folder tree that keeps your own order. The view you choose is remembered for every new tab.
- **Organize**: drag bookmarks and folders onto other folders (List view), or use the edit button's Folder field in either view.
- **Folders**: create, rename and delete folders right on the page.
- **Add bookmarks** by typing a URL. `example.com` is enough, and `https://` is added for you.
- **Notes**: write a private note on any bookmark. Notes save automatically.
- **Search** titles, URLs and notes. Press `/` to jump to the search box.
- **Custom CSS**: restyle the whole page from the Settings panel at the bottom.
- Light and dark mode follow your system setting.

Bookmark changes go straight to your browser's real bookmarks. Notes, settings and custom CSS are stored locally in the browser and never leave your machine.

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

**Updating:** pull or download the new code, then click the reload icon on the extension's card in `chrome://extensions`.

## Install in Firefox

Firefox 128 or newer is required.

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
   npx web-ext sign --channel=unlisted --api-key=YOUR_KEY --api-secret=YOUR_SECRET
   ```

3. Open the `.xpi` file it creates in `web-ext-artifacts/` with Firefox (drag it into a Firefox window) and confirm the install.

Before signing, change the add-on ID in `manifest.json` (`browser_specific_settings.gecko.id`) from `bookmark-homepage@extension` to something unique to you, such as `newtab@yourdomain.com`.

Firefox Developer Edition, Nightly and ESR can instead install unsigned add-ons: set `xpinstall.signatures.required` to `false` in `about:config`. Then zip the folder's contents and install the zip from `about:addons` → gear menu → **Install Add-on From File…**.

## Custom styling

Open **Settings** at the bottom of the page, paste CSS into the editor and click **Save Style** (or press Ctrl+S). Your CSS loads after the built-in styles, so it overrides them.

The quickest way to re-theme is to override the colour variables:

```css
:root {
  --accent: #e11d48;
  --accent-2: #f97316;
  --radius: 6px;
}
```

Useful selectors:

| Selector | What it styles |
| --- | --- |
| `#bookmark-list[data-view="grid"]` / `[data-view="list"]` | The main area in each view |
| `.bookmark-item` | A bookmark card (grid) or row (list) |
| `.bookmark-avatar` | The coloured letter tile |
| `.bookmark-title`, `.bookmark-url`, `.bookmark-note` | Parts of each bookmark |
| `.bookmark-folder-group`, `.bookmark-folder-header`, `.bookmark-folder-children` | Folders in List view |
| `#settings-panel`, `#css-editor` | The settings area |

The full list of selectors and variables is in the comment at the top of `newtab.html`. **Reset Style** removes your CSS and restores the default look.

## Permissions

| Permission | Why |
| --- | --- |
| `bookmarks` | Read, add, edit, move and delete your bookmarks |
| `storage` | Save notes, the chosen view, folder open/closed state and custom CSS |
