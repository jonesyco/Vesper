// The sites to show: web pages only, no duplicates, none the user hid.
export function visibleTopSites(sites, hidden, count) {
  if (!Array.isArray(sites) || count <= 0) {
    return [];
  }
  const hiddenUrls = new Set(hidden);
  const seen = new Set();
  const result = [];
  for (const site of sites) {
    if (!site || typeof site.url !== "string") {
      continue;
    }
    let parsed;
    try {
      parsed = new URL(site.url);
    } catch {
      continue;
    }
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || hiddenUrls.has(site.url) || seen.has(site.url)) {
      continue;
    }
    seen.add(site.url);
    result.push({ url: site.url, title: site.title || parsed.hostname.replace(/^www\./, "") });
    if (result.length === count) {
      break;
    }
  }
  return result;
}
