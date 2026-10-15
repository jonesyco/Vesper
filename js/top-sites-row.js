import { api, isChromium } from "./api.js";
import { $, createElement, createIcon, hashHue, hostOf, avatarLetter } from "./ui.js";
import { visibleTopSites } from "./lib/top-sites.js";
import { getSettings, subscribe, updateSettings } from "./settings-store.js";

const MAX_PER_ROW = 8;

let allSites = [];

// Chrome's built-in favicon cache; served locally, never fetched from the web.
function faviconUrl(pageUrl) {
  return api.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=64`);
}

function createLetterTile(site) {
  const tile = createElement("span", "top-site-letter", avatarLetter(site.title));
  tile.style.setProperty("--hue", String(hashHue(hostOf(site.url))));
  tile.setAttribute("aria-hidden", "true");
  return tile;
}

function createTile(site) {
  const item = createElement("div", "top-site");

  const link = createElement("a", "top-site-link");
  link.href = site.url;
  link.title = site.title;

  const icon = createElement("span", "top-site-icon");
  if (isChromium) {
    const image = document.createElement("img");
    image.alt = "";
    image.src = faviconUrl(site.url);
    image.addEventListener("error", () => icon.replaceChildren(createLetterTile(site)), { once: true });
    icon.append(image);
  } else {
    icon.append(createLetterTile(site));
  }
  link.append(icon, createElement("span", "top-site-title", site.title));

  const hide = createElement("button", "top-site-hide");
  hide.type = "button";
  hide.title = `Hide ${site.title}`;
  hide.setAttribute("aria-label", `Hide ${site.title}`);
  hide.append(createIcon("x"));
  hide.addEventListener("click", () => {
    updateSettings({ hiddenTopSites: [...getSettings().hiddenTopSites, site.url] });
  });

  item.append(link, hide);
  return item;
}

function render(settings) {
  const sites = visibleTopSites(allSites, settings.hiddenTopSites, settings.topSitesCount);
  const nav = $("top-sites");
  nav.replaceChildren(...sites.map(createTile));
  nav.hidden = sites.length === 0;
  // Spread the sites evenly over the fewest rows, e.g. 12 as 6 + 6 rather than 8 + 4.
  const rows = Math.ceil(sites.length / MAX_PER_ROW);
  nav.style.setProperty("--columns", String(Math.max(1, Math.ceil(sites.length / Math.max(1, rows)))));
}

export async function initTopSites() {
  try {
    allSites = (await api.topSites.get()) || [];
  } catch (error) {
    console.error("Couldn't read top sites:", error);
    allSites = [];
  }
  render(getSettings());
  subscribe(render);
}
