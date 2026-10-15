import { api } from "./api.js";
import { $, confirmAction } from "./ui.js";

export const CSS_STORAGE_KEY = "custom_theme_css";
const CUSTOM_STYLE_ELEMENT_ID = "custom-theme-style";
const STATUS_CLEAR_DELAY_MS = 2500;

let settingsStatusTimer = null;

export function applyCustomCss(cssText) {
  let styleElement = $(CUSTOM_STYLE_ELEMENT_ID);

  if (!cssText) {
    if (styleElement) {
      styleElement.remove();
    }
    return;
  }

  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = CUSTOM_STYLE_ELEMENT_ID;
  }

  styleElement.textContent = cssText;
  // appendChild moves an existing element, so the custom sheet always stays
  // last in <head> and wins over the default styles.
  document.head.appendChild(styleElement);
}

async function saveCustomCss(cssText) {
  if (cssText.trim() === "") {
    await api.storage.local.remove(CSS_STORAGE_KEY);
    applyCustomCss("");
  } else {
    await api.storage.local.set({ [CSS_STORAGE_KEY]: cssText });
    applyCustomCss(cssText);
  }
}

function showSettingsStatus(message) {
  const statusElement = $("settings-status");
  statusElement.textContent = message;
  clearTimeout(settingsStatusTimer);
  settingsStatusTimer = setTimeout(() => {
    statusElement.textContent = "";
  }, STATUS_CLEAR_DELAY_MS);
}

export function initCssEditor(initialCss) {
  const editor = $("css-editor");
  editor.value = initialCss;

  const handleSave = async () => {
    try {
      await saveCustomCss(editor.value);
      showSettingsStatus("Style saved.");
    } catch (error) {
      console.error("Failed to save custom CSS:", error);
      showSettingsStatus("Could not save style.");
    }
  };

  $("save-style-btn").addEventListener("click", handleSave);

  $("reset-style-btn").addEventListener("click", async () => {
    const confirmed = await confirmAction({
      title: "Reset style?",
      message: "Your custom CSS will be removed and the default style restored.",
      confirmLabel: "Reset"
    });
    if (!confirmed) {
      return;
    }
    editor.value = "";
    try {
      await saveCustomCss("");
      showSettingsStatus("Default style restored.");
    } catch (error) {
      console.error("Failed to reset custom CSS:", error);
      showSettingsStatus("Could not reset style.");
    }
  });

  editor.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      handleSave();
      return;
    }

    // Insert two spaces instead of moving focus, so indenting CSS feels natural.
    // Shift+Tab still moves focus backwards for keyboard users.
    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.value = editor.value.slice(0, start) + "  " + editor.value.slice(end);
      editor.selectionStart = start + 2;
      editor.selectionEnd = start + 2;
    }
  });
}

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
