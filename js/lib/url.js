export function normalizeUrl(input) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Enter a URL.");
  }
  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed);
  let parsed;
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }
  if (!["http:", "https:", "ftp:", "mailto:"].includes(parsed.protocol)) {
    throw new Error("Only http, https, ftp and mailto links can be added here.");
  }
  return parsed.href;
}

// File extensions: "node.js" or "next.config.js" alone is far more likely a search.
const FILE_EXTENSIONS = new Set([
  "js", "jsx", "mjs", "cjs", "ts", "tsx", "vue", "svelte", "md", "rst", "txt", "log", "py", "rb",
  "php", "java", "kt", "swift", "rs", "go", "sh", "bat", "ps1", "lua", "sql", "c", "h", "cpp", "hpp",
  "json", "toml", "yml", "yaml", "ini", "cfg", "conf", "lock", "xml", "csv", "css", "scss", "sass",
  "less", "html", "htm", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "png", "jpg", "jpeg",
  "gif", "webp", "svg", "ico", "mp3", "mp4", "mov", "wav", "zip", "tar", "gz", "exe", "dll", "iso"
]);

// Generic TLDs accepted for a bare "name.tld"; any two-letter country code is accepted too.
// Anything else (an unusual or new TLD) needs a path, a port or https:// to count as an address.
const GENERIC_TLDS = new Set([
  "com", "net", "org", "edu", "gov", "mil", "int", "info", "biz", "name", "pro", "mobi", "app",
  "dev", "page", "blog", "cloud", "online", "site", "website", "tech", "store", "shop", "news",
  "live", "wiki", "xyz", "art", "design", "studio", "media", "email", "link", "network", "systems",
  "digital", "agency", "world", "today", "life", "social", "space", "club", "top", "one", "museum",
  "travel", "jobs", "aero", "coop"
]);

function isLocalHost(host) {
  return host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

// Decides whether start-page input is an address to open rather than a search.
export function looksLikeUrl(input) {
  const text = input.trim();
  if (!text || text.startsWith("?") || /\s/.test(text)) {
    return false;
  }
  if (/^(https?|ftp):\/\//i.test(text) || /^mailto:/i.test(text)) {
    return true;
  }
  const match = text.match(/^([^/?#:]+)(:\d{1,5})?([/?#].*)?$/);
  if (!match) {
    return false;
  }
  const host = match[1].toLowerCase();
  if (isLocalHost(host)) {
    return true;
  }
  const labels = host.split(".");
  if (labels.length < 2 || labels.some((label) => !/^[\p{L}\p{N}-]+$/u.test(label))) {
    return false;
  }
  const tld = labels[labels.length - 1];
  if (!/^\p{L}{2,24}$/u.test(tld)) {
    return false;
  }
  if (match[2] || match[3]) {
    return true; // A port or path makes it clearly an address.
  }
  if (FILE_EXTENSIONS.has(tld)) {
    return false;
  }
  // Non-ASCII TLDs (such as .рф) are internationalised country or brand domains.
  return tld.length === 2 || GENERIC_TLDS.has(tld) || /[^a-z]/.test(tld);
}

// The text to search for: trimmed, without a leading "?" (which forces a search).
export function searchText(input) {
  return input.trim().replace(/^\?\s*/, "");
}

// Like normalizeUrl, but local addresses get http:// since they rarely have certificates.
export function toNavigableUrl(input) {
  const text = input.trim();
  const host = text.split(/[/:?#]/)[0].toLowerCase();
  // "localhost:3000" has no scheme; only "scheme://" or "mailto:" count as one.
  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(text) || /^mailto:/i.test(text);
  if (!hasScheme && isLocalHost(host)) {
    return normalizeUrl(`http://${text}`);
  }
  return normalizeUrl(text);
}
