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
