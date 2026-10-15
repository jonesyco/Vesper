const TOAST_DURATION_MS = 3200;

const SVG_NS = "http://www.w3.org/2000/svg";
const FOLDER_PATH = "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z";
const ICON_PATHS = {
  bookmark: "M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  plus: "M12 5v14M5 12h14",
  folder: FOLDER_PATH,
  folderPlus: FOLDER_PATH + "M12 10.5v5M9.5 13h5",
  pencil: "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5",
  grip: "M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01",
  chevron: "M9 6l6 6-6 6",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  list: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  sliders: "M4 6h9M17 6h3M15 4v4M4 12h3M11 12h9M9 10v4M4 18h11M19 18h1M17 16v4",
  x: "M6 6l12 12M18 6L6 18",
  skip: "M5 5l9 7-9 7zM18 5v14"
};

function $(id) {
  return document.getElementById(id);
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function createIcon(name) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", `icon icon-${name}`);
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICON_PATHS[name]);
  svg.append(path);
  return svg;
}

function createIconSlot(name, className) {
  const slot = createElement("span", `icon-slot${className ? ` ${className}` : ""}`);
  slot.append(createIcon(name));
  return slot;
}

function hydrateIcons(root) {
  for (const element of root.querySelectorAll("[data-icon]")) {
    element.replaceChildren(createIcon(element.dataset.icon));
  }
}

function createIconButton(iconName, label, onClick, extraClass) {
  const button = createElement("button", `icon-btn${extraClass ? ` ${extraClass}` : ""}`);
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.append(createIcon(iconName));
  button.addEventListener("click", (event) => {
    // Buttons live inside <summary> in list view; don't toggle the folder.
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

// Hand-picked hues that stay readable in light and dark mode (no washed-out yellows).
const ACCENT_HUES = [210, 235, 260, 285, 315, 340, 5, 25, 150, 170, 190];

function hashHue(text) {
  let hash = 0;
  for (const character of text) {
    hash = (hash * 31 + character.codePointAt(0)) % 1000003;
  }
  return ACCENT_HUES[hash % ACCENT_HUES.length];
}

function hostOf(url) {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

function formatUrlForDisplay(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return parsed.host ? parsed.host.replace(/^www\./, "") + path : url;
  } catch {
    return url;
  }
}

function avatarLetter(title) {
  const match = title.match(/[\p{L}\p{N}]/u);
  return match ? match[0].toUpperCase() : "•";
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

function showToast(message, kind = "info") {
  const toast = createElement("div", `toast toast-${kind}`, message);
  $("toast-region").append(toast);
  setTimeout(() => {
    toast.classList.add("toast-leaving");
    setTimeout(() => toast.remove(), 300);
  }, TOAST_DURATION_MS);
}

function confirmAction({ title, message, confirmLabel }) {
  const dialog = $("confirm-dialog");
  $("confirm-title").textContent = title;
  $("confirm-message").textContent = message;
  $("confirm-ok").textContent = confirmLabel;
  dialog.returnValue = "";
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
  });
}

// True when a key press is going into a text field and shouldn't trigger shortcuts.
function isTypingTarget(target) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable]"));
}

export {
  $, createElement, createIcon, createIconSlot, hydrateIcons, createIconButton,
  hashHue, hostOf, formatUrlForDisplay, avatarLetter, plural, errorMessage,
  showToast, confirmAction, isTypingTarget
};
