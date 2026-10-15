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
