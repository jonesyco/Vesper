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

// Extensions that are also TLDs: "node.js" alone is far more likely a search.
const FILE_EXTENSIONS = new Set([
  "js", "ts", "md", "py", "txt", "json", "css", "html", "rs", "go", "sh",
  "yml", "yaml", "xml", "csv", "pdf", "doc", "docx", "png", "jpg", "zip", "exe"
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
  const bare = labels.length === 2 && !match[2] && !match[3];
  return !(bare && FILE_EXTENSIONS.has(tld));
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
