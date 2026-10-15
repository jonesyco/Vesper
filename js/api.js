// Firefox exposes the promise-based `browser` namespace; Chrome uses `chrome`
// (which also returns promises in Manifest V3).
export const api = globalThis.browser ?? globalThis.chrome;

// Chromium-only features (such as the built-in favicon service) key off this.
export const isChromium = api.runtime.getURL("").startsWith("chrome-extension://");
