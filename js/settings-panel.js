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
