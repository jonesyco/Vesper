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
