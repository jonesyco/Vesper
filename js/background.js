import { api } from "./api.js";
import { $, createElement } from "./ui.js";
import { BUNDLED_PHOTOS } from "./lib/bundled-photos.js";
import { resolveBackground } from "./lib/rotation.js";
import * as images from "./image-store.js";
import { getSettings, subscribe } from "./settings-store.js";

export const USER_PHOTO_PREFIX = "user:";
const STATE_STORAGE_KEY = "background_state";
// localStorage, so the last bundled photo can be painted before anything async runs.
const CACHE_KEY = "newtab.background";
const FADE_CLEANUP_DELAY_MS = 700;

let currentId = null;
let currentObjectUrl = null;
let generation = 0;

// Read straight from IndexedDB so the very first pick already sees user photos.
async function listUserPhotoIds() {
  return (await images.isAvailable()) ? images.listPhotoIds() : [];
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
    const blob = await images.getPhotoBlob(id.slice(USER_PHOTO_PREFIX.length));
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
    writeCache(source.file ? { id: decision.id, file: source.file, credit: source.credit, frequency: settings.photoFrequency } : null);
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
  document.documentElement.style.setProperty("--blur", `${settings.blur}px`);
  // Enlarge the photo slightly with the blur so its soft edges stay off-screen.
  document.documentElement.style.setProperty("--blur-scale", String(1 + settings.blur / 200));
}

// Paints the last bundled photo straight away so a new tab never flashes empty.
export function paintCachedBackground() {
  const cached = readCache();
  // In every-tab mode this tab gets a different photo, so painting the old one would flash.
  if (cached && cached.frequency !== "every-tab") {
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
