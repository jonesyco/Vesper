import { api } from "./api.js";
import { hydrateIcons } from "./ui.js";
import { CSS_STORAGE_KEY, applyCustomCss, initCssEditor, handleCssStorageChange } from "./custom-css.js";
import { MANAGER_STORAGE_KEYS, initManager } from "./manager.js";
import { paintCachedBackground, initBackground } from "./background.js";
import { loadSettings } from "./settings-store.js";
import { initClock } from "./clock.js";
import { initStartSearch } from "./start-search.js";
import { initShortcuts } from "./shortcuts.js";
import { initTopSites } from "./top-sites-row.js";
import { initSheet } from "./sheet.js";
import { initSettingsPanel } from "./settings-panel.js";

// Runs before anything awaits, so the last photo is on the first frame.
paintCachedBackground();

async function init() {
  hydrateIcons(document);

  // Apply custom CSS before anything renders, so restyled parts never flash.
  let stored = {};
  try {
    stored = await api.storage.local.get([CSS_STORAGE_KEY, ...MANAGER_STORAGE_KEYS]);
  } catch (error) {
    console.error("Failed to load settings:", error);
  }
  const initialCss = typeof stored[CSS_STORAGE_KEY] === "string" ? stored[CSS_STORAGE_KEY] : "";
  applyCustomCss(initialCss);
  api.storage.onChanged.addListener(handleCssStorageChange);

  await loadSettings();
  initBackground();
  initClock();
  initStartSearch();
  initTopSites();
  initSheet();
  initShortcuts();
  initCssEditor(initialCss);
  initSettingsPanel();

  await initManager(stored);
}

init();
