import { api } from "./api.js";
import { $, createElement, hashHue, hostOf, avatarLetter, formatUrlForDisplay, showToast } from "./ui.js";
import { looksLikeUrl, searchText, toNavigableUrl } from "./lib/url.js";
import { searchBookmarks } from "./manager.js";
import { getSettings, subscribe } from "./settings-store.js";

const SUGGESTION_LIMIT = 5;

let suggestions = [];
let activeIndex = -1;

function openUrl(url) {
  window.location.href = url;
}

function renderSuggestions() {
  const input = $("start-search");
  const list = $("search-suggestions");

  list.replaceChildren(...suggestions.map((bookmark, index) => {
    const item = createElement("li", "suggestion");
    item.id = `suggestion-${index}`;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(index === activeIndex));
    item.style.setProperty("--hue", String(hashHue(hostOf(bookmark.url))));

    const avatar = createElement("span", "bookmark-avatar", avatarLetter(bookmark.title));
    avatar.setAttribute("aria-hidden", "true");
    const text = createElement("span", "suggestion-text");
    text.append(
      createElement("span", "suggestion-title", bookmark.title),
      createElement("span", "suggestion-url", formatUrlForDisplay(bookmark.url))
    );
    item.append(avatar, text);

    // Keep focus in the input so the list doesn't close before the click lands.
    item.addEventListener("pointerdown", (event) => event.preventDefault());
    item.addEventListener("click", () => openUrl(bookmark.url));
    return item;
  }));

  list.hidden = suggestions.length === 0;
  input.setAttribute("aria-expanded", String(!list.hidden));
  if (activeIndex >= 0) {
    input.setAttribute("aria-activedescendant", `suggestion-${activeIndex}`);
  } else {
    input.removeAttribute("aria-activedescendant");
  }
}

function updateSuggestions() {
  const query = searchText($("start-search").value);
  suggestions = getSettings().searchSuggestions && query ? searchBookmarks(query, SUGGESTION_LIMIT) : [];
  activeIndex = -1;
  renderSuggestions();
}

function closeSuggestions() {
  suggestions = [];
  activeIndex = -1;
  renderSuggestions();
}

async function submit() {
  const raw = $("start-search").value;
  if (activeIndex >= 0) {
    openUrl(suggestions[activeIndex].url);
    return;
  }
  if (!raw.trim()) {
    return;
  }
  if (looksLikeUrl(raw)) {
    try {
      openUrl(toNavigableUrl(raw));
      return;
    } catch {
      // Not a usable address after all; search for it instead.
    }
  }
  const text = searchText(raw);
  try {
    if (api.search.query) {
      await api.search.query({ text, disposition: "CURRENT_TAB" });
    } else {
      await api.search.search({ query: text });
    }
  } catch (error) {
    console.error("Search failed:", error);
    showToast("Couldn't search", "error");
  }
}

function applyVisibility(settings) {
  $("start-search-form").hidden = !settings.showSearch;
  if (!settings.searchSuggestions) {
    closeSuggestions();
  }
}

export function initStartSearch() {
  const form = $("start-search-form");
  const input = $("start-search");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submit();
  });

  input.addEventListener("input", updateSuggestions);
  input.addEventListener("blur", closeSuggestions);

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (suggestions.length === 0) {
        return;
      }
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      // -1 means "nothing selected", so the cycle runs -1, 0 … n-1, -1.
      activeIndex = ((activeIndex + 1 + step + suggestions.length + 1) % (suggestions.length + 1)) - 1;
      renderSuggestions();
    } else if (event.key === "Escape") {
      if (suggestions.length > 0) {
        event.preventDefault();
        closeSuggestions();
      } else if (input.value) {
        event.preventDefault();
        input.value = "";
      }
    }
  });

  applyVisibility(getSettings());
  subscribe(applyVisibility);
}
