"use strict";

// Firefox exposes the promise-based `browser` namespace; Chrome uses `chrome`
// (which also returns promises in Manifest V3).
const api = globalThis.browser ?? globalThis.chrome;

const CSS_STORAGE_KEY = "custom_theme_css";
const VIEW_STORAGE_KEY = "view_mode";
const COLLAPSED_STORAGE_KEY = "collapsed_folders";
const LAST_FOLDER_STORAGE_KEY = "last_folder_id";
const NOTE_KEY_PREFIX = "note_";
const NOTE_SAVE_DELAY_MS = 500;
const NOTE_SAVED_CLEAR_DELAY_MS = 2000;
const CUSTOM_STYLE_ELEMENT_ID = "custom-theme-style";
const STATUS_CLEAR_DELAY_MS = 2500;
const TOAST_DURATION_MS = 3200;
const REFRESH_DELAY_MS = 150;
const DRAG_EXPAND_DELAY_MS = 700;
const BOOKMARK_DRAG_TYPE = "application/x-bookmark-homepage-id";

const VIEW_GRID = "grid";
const VIEW_LIST = "list";
const VIEW_MODES = [VIEW_GRID, VIEW_LIST];

const TYPE_BOOKMARK = "bookmark";
const TYPE_FOLDER = "folder";

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
  sliders: "M4 6h9M17 6h3M15 4v4M4 12h3M11 12h9M9 10v4M4 18h11M19 18h1M17 16v4"
};

const state = {
  view: VIEW_GRID,
  topLevel: [],          // normalized top-level folders (Bookmarks bar, Other bookmarks, ...)
  nodesById: new Map(),  // id -> normalized bookmark or folder
  notes: {},             // bookmarkId -> note text
  collapsed: new Set(),  // ids of folders collapsed in list view
  lastFolderId: null,
  query: ""
};

// bookmarkId -> { timer, textarea, statusElement } for notes typed but not yet saved.
const pendingNoteSaves = new Map();
let settingsStatusTimer = null;
let refreshTimer = null;
let refreshAfterDrag = false;
let dragState = null;    // { id, dropTarget, expandTimer } while dragging
let dialogState = null;  // { mode, node } while the edit dialog is open

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

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

function normalizeUrl(input) {
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

// ---------------------------------------------------------------------------
// Toasts and confirmation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Custom CSS
// ---------------------------------------------------------------------------

function applyCustomCss(cssText) {
  let styleElement = $(CUSTOM_STYLE_ELEMENT_ID);

  if (!cssText) {
    if (styleElement) {
      styleElement.remove();
    }
    return;
  }

  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = CUSTOM_STYLE_ELEMENT_ID;
  }

  styleElement.textContent = cssText;
  // appendChild moves an existing element, so the custom sheet always stays
  // last in <head> and wins over the default styles.
  document.head.appendChild(styleElement);
}

async function saveCustomCss(cssText) {
  if (cssText.trim() === "") {
    await api.storage.local.remove(CSS_STORAGE_KEY);
    applyCustomCss("");
  } else {
    await api.storage.local.set({ [CSS_STORAGE_KEY]: cssText });
    applyCustomCss(cssText);
  }
}

function showSettingsStatus(message) {
  const statusElement = $("settings-status");
  statusElement.textContent = message;
  clearTimeout(settingsStatusTimer);
  settingsStatusTimer = setTimeout(() => {
    statusElement.textContent = "";
  }, STATUS_CLEAR_DELAY_MS);
}

function initSettingsPanel(initialCss) {
  const panel = $("settings-panel");
  const settingsButton = $("settings-btn");
  const editor = $("css-editor");

  editor.value = initialCss;

  settingsButton.addEventListener("click", () => {
    panel.open = !panel.open;
    if (panel.open) {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
      editor.focus({ preventScroll: true });
    }
  });

  panel.addEventListener("toggle", () => {
    settingsButton.setAttribute("aria-expanded", String(panel.open));
  });

  const handleSave = async () => {
    try {
      await saveCustomCss(editor.value);
      showSettingsStatus("Style saved.");
    } catch (error) {
      console.error("Failed to save custom CSS:", error);
      showSettingsStatus("Could not save style.");
    }
  };

  $("save-style-btn").addEventListener("click", handleSave);

  $("reset-style-btn").addEventListener("click", async () => {
    const confirmed = await confirmAction({
      title: "Reset style?",
      message: "Your custom CSS will be removed and the default style restored.",
      confirmLabel: "Reset"
    });
    if (!confirmed) {
      return;
    }
    editor.value = "";
    try {
      await saveCustomCss("");
      showSettingsStatus("Default style restored.");
    } catch (error) {
      console.error("Failed to reset custom CSS:", error);
      showSettingsStatus("Could not reset style.");
    }
  });

  editor.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      handleSave();
      return;
    }

    // Insert two spaces instead of moving focus, so indenting CSS feels natural.
    // Shift+Tab still moves focus backwards for keyboard users.
    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.value = editor.value.slice(0, start) + "  " + editor.value.slice(end);
      editor.selectionStart = start + 2;
      editor.selectionEnd = start + 2;
    }
  });
}

// ---------------------------------------------------------------------------
// View mode, search and keyboard shortcuts
// ---------------------------------------------------------------------------

function updateViewToggleButtons() {
  for (const button of document.querySelectorAll(".view-toggle-btn")) {
    button.setAttribute("aria-pressed", String(button.dataset.view === state.view));
  }
}

function initViewToggle() {
  updateViewToggleButtons();

  for (const button of document.querySelectorAll(".view-toggle-btn")) {
    button.addEventListener("click", async () => {
      const view = button.dataset.view;
      if (view === state.view || !VIEW_MODES.includes(view)) {
        return;
      }
      state.view = view;
      updateViewToggleButtons();
      renderBookmarks();
      try {
        // Saved so every new tab opens in this view.
        await api.storage.local.set({ [VIEW_STORAGE_KEY]: view });
      } catch (error) {
        console.error("Failed to save view mode:", error);
      }
    });
  }
}

function initSearch() {
  const input = $("search-input");

  input.addEventListener("input", () => {
    state.query = input.value.trim().toLowerCase();
    renderBookmarks();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && input.value) {
      event.preventDefault();
      input.value = "";
      state.query = "";
      renderBookmarks();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const target = event.target;
    const isTyping = target instanceof Element && target.closest("input, textarea, select, [contenteditable]");
    if (isTyping || document.querySelector("dialog[open]")) {
      return;
    }
    event.preventDefault();
    input.focus();
  });
}

function initToolbar() {
  $("add-bookmark-btn").addEventListener("click", () => openEditDialog("add-bookmark"));
  $("add-folder-btn").addEventListener("click", () => openEditDialog("add-folder"));
}

// ---------------------------------------------------------------------------
// Persistence of small UI preferences
// ---------------------------------------------------------------------------

async function persistCollapsed() {
  try {
    await api.storage.local.set({ [COLLAPSED_STORAGE_KEY]: [...state.collapsed] });
  } catch (error) {
    console.error("Failed to save folder state:", error);
  }
}

function expandFolder(folderId) {
  if (state.collapsed.delete(folderId)) {
    persistCollapsed();
  }
}

async function rememberFolder(folderId) {
  state.lastFolderId = folderId;
  try {
    await api.storage.local.set({ [LAST_FOLDER_STORAGE_KEY]: folderId });
  } catch (error) {
    console.error("Failed to save last folder:", error);
  }
}

// ---------------------------------------------------------------------------
// Bookmark data
// ---------------------------------------------------------------------------

// Converts a browser bookmark node into { type: "bookmark" | "folder", ... }.
// Separators (Firefox), javascript: bookmarklets and place: queries are
// dropped because they can't be opened from this page.
//   fixed    - can't be moved, renamed or deleted (top-level and managed nodes)
//   readOnly - nothing can be added to it (managed folders)
function normalizeNode(node, isTopLevel) {
  if (node.type === "separator") {
    return null;
  }

  if (typeof node.url === "string") {
    const lowerUrl = node.url.toLowerCase();
    if (lowerUrl.startsWith("javascript:") || lowerUrl.startsWith("place:")) {
      return null;
    }
    return {
      type: TYPE_BOOKMARK,
      id: node.id,
      parentId: node.parentId,
      title: node.title || node.url,
      url: node.url,
      fixed: Boolean(node.unmodifiable)
    };
  }

  const children = (node.children || []).map((child) => normalizeNode(child, false)).filter(Boolean);
  let bookmarkCount = 0;
  let folderCount = 0;
  for (const child of children) {
    if (child.type === TYPE_BOOKMARK) {
      bookmarkCount += 1;
    } else {
      bookmarkCount += child.bookmarkCount;
      folderCount += 1 + child.folderCount;
    }
  }

  const readOnly = Boolean(node.unmodifiable);
  return {
    type: TYPE_FOLDER,
    id: node.id,
    parentId: node.parentId,
    title: node.title,
    children,
    bookmarkCount,
    folderCount,
    fixed: isTopLevel || readOnly,
    readOnly
  };
}

function indexNodes(nodes, index) {
  for (const node of nodes) {
    index.set(node.id, node);
    if (node.type === TYPE_FOLDER) {
      indexNodes(node.children, index);
    }
  }
  return index;
}

function collectBookmarkIds(nodes, results) {
  for (const node of nodes) {
    if (node.type === TYPE_BOOKMARK) {
      results.push(node.id);
    } else {
      collectBookmarkIds(node.children, results);
    }
  }
  return results;
}

function flattenBookmarks(nodes, folderPath, results) {
  for (const node of nodes) {
    if (node.type === TYPE_BOOKMARK) {
      results.push({ ...node, folder: folderPath.join(" / ") });
    } else {
      const childPath = node.title ? [...folderPath, node.title] : folderPath;
      flattenBookmarks(node.children, childPath, results);
    }
  }
  return results;
}

function sortBookmarks(bookmarks) {
  return bookmarks.sort((a, b) => {
    const byTitle = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    return byTitle !== 0 ? byTitle : a.url.localeCompare(b.url);
  });
}

function bookmarkMatches(bookmark, query) {
  return (
    bookmark.title.toLowerCase().includes(query) ||
    bookmark.url.toLowerCase().includes(query) ||
    (state.notes[bookmark.id] || "").toLowerCase().includes(query)
  );
}

// Keeps bookmarks that match, plus the folders leading to them. A folder whose
// own name matches is kept with all of its contents.
function filterTree(nodes, query) {
  const results = [];
  for (const node of nodes) {
    if (node.type === TYPE_BOOKMARK) {
      if (bookmarkMatches(node, query)) {
        results.push(node);
      }
    } else if (node.title.toLowerCase().includes(query)) {
      results.push(node);
    } else {
      const children = filterTree(node.children, query);
      if (children.length > 0) {
        results.push({ ...node, children });
      }
    }
  }
  return results;
}

function defaultFolderId() {
  const last = state.nodesById.get(state.lastFolderId);
  if (last && last.type === TYPE_FOLDER && !last.readOnly) {
    return last.id;
  }
  const firstWritable = state.topLevel.find((node) => node.type === TYPE_FOLDER && !node.readOnly);
  return firstWritable ? firstWritable.id : null;
}

async function loadBookmarkData() {
  const [root] = await api.bookmarks.getTree();
  const topLevel = (root.children || []).map((child) => normalizeNode(child, true)).filter(Boolean);
  const nodesById = indexNodes(topLevel, new Map());
  const notes = await loadNotes(collectBookmarkIds(topLevel, []));

  // Keep text that's typed but not saved yet.
  for (const [id, pending] of pendingNoteSaves) {
    notes[id] = pending.textarea.value;
  }

  state.topLevel = topLevel;
  state.nodesById = nodesById;
  state.notes = notes;
}

async function refresh() {
  try {
    await loadBookmarkData();
    renderBookmarks();
  } catch (error) {
    console.error("Failed to load bookmarks:", error);
    $("bookmark-count").textContent = "";
    renderMessage($("bookmark-list"), "Could not load bookmarks.");
  }
}

// Bookmark events arrive in bursts (imports, folder deletes), so batch them.
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (dragState) {
      refreshAfterDrag = true;
      return;
    }
    refresh();
  }, REFRESH_DELAY_MS);
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

function noteKey(bookmarkId) {
  return NOTE_KEY_PREFIX + bookmarkId;
}

async function loadNotes(bookmarkIds) {
  if (bookmarkIds.length === 0) {
    return {};
  }
  const stored = await api.storage.local.get(bookmarkIds.map(noteKey));
  const notes = {};
  for (const id of bookmarkIds) {
    const value = stored[noteKey(id)];
    notes[id] = typeof value === "string" ? value : "";
  }
  return notes;
}

async function saveNote(bookmarkId, text) {
  // Each note has its own key, so concurrent saves never overwrite each other.
  if (text.trim() === "") {
    await api.storage.local.remove(noteKey(bookmarkId));
  } else {
    await api.storage.local.set({ [noteKey(bookmarkId)]: text });
  }
}

async function removeNotes(bookmarkIds) {
  for (const id of bookmarkIds) {
    const pending = pendingNoteSaves.get(id);
    if (pending) {
      clearTimeout(pending.timer);
      pendingNoteSaves.delete(id);
    }
    delete state.notes[id];
  }
  if (bookmarkIds.length > 0) {
    await api.storage.local.remove(bookmarkIds.map(noteKey));
  }
}

async function flushNote(bookmarkId) {
  const pending = pendingNoteSaves.get(bookmarkId);
  if (!pending) {
    return;
  }
  clearTimeout(pending.timer);
  pendingNoteSaves.delete(bookmarkId);
  const { textarea, statusElement } = pending;
  try {
    await saveNote(bookmarkId, textarea.value);
    statusElement.textContent = "Saved";
    setTimeout(() => {
      if (statusElement.textContent === "Saved") {
        statusElement.textContent = "";
      }
    }, NOTE_SAVED_CLEAR_DELAY_MS);
  } catch (error) {
    console.error(`Failed to save note for bookmark ${bookmarkId}:`, error);
    statusElement.textContent = "Save failed";
  }
}

function scheduleNoteSave(bookmarkId, textarea, statusElement) {
  const pending = pendingNoteSaves.get(bookmarkId);
  if (pending) {
    clearTimeout(pending.timer);
  }
  state.notes[bookmarkId] = textarea.value;
  statusElement.textContent = "Saving…";
  const timer = setTimeout(() => flushNote(bookmarkId), NOTE_SAVE_DELAY_MS);
  pendingNoteSaves.set(bookmarkId, { timer, textarea, statusElement });
}

// ---------------------------------------------------------------------------
// Bookmark and folder actions
// ---------------------------------------------------------------------------

function canMoveInto(nodeId, folderId) {
  const node = state.nodesById.get(nodeId);
  const folder = state.nodesById.get(folderId);
  if (!node || !folder || folder.type !== TYPE_FOLDER) {
    return false;
  }
  if (node.fixed || folder.readOnly || node.parentId === folderId) {
    return false;
  }
  // A folder can't be moved into itself or one of its own subfolders.
  for (let current = folder; current; current = state.nodesById.get(current.parentId)) {
    if (current.id === node.id) {
      return false;
    }
  }
  return true;
}

async function moveNode(nodeId, folderId) {
  const node = state.nodesById.get(nodeId);
  const folder = state.nodesById.get(folderId);
  try {
    await api.bookmarks.move(nodeId, { parentId: folderId });
    expandFolder(folderId);
    showToast(`Moved “${node.title}” to ${folder.title}`, "success");
  } catch (error) {
    console.error("Failed to move bookmark:", error);
    showToast(`Couldn't move “${node.title}”: ${errorMessage(error)}`, "error");
  }
}

async function deleteBookmark(bookmark) {
  const confirmed = await confirmAction({
    title: "Delete bookmark?",
    message: `“${bookmark.title}” will be removed from your browser's bookmarks, along with its note. This can't be undone.`,
    confirmLabel: "Delete"
  });
  if (!confirmed) {
    return;
  }
  try {
    await api.bookmarks.remove(bookmark.id);
    await removeNotes([bookmark.id]);
    showToast(`Deleted “${bookmark.title}”`, "success");
  } catch (error) {
    console.error("Failed to delete bookmark:", error);
    showToast(`Couldn't delete “${bookmark.title}”: ${errorMessage(error)}`, "error");
  }
}

async function deleteFolder(folder) {
  const contents = [];
  if (folder.bookmarkCount > 0) {
    contents.push(plural(folder.bookmarkCount, "bookmark"));
  }
  if (folder.folderCount > 0) {
    contents.push(plural(folder.folderCount, "folder"));
  }
  const message = contents.length > 0
    ? `“${folder.title}” and everything inside it (${contents.join(" and ")}) will be deleted. This can't be undone.`
    : `The empty folder “${folder.title}” will be deleted.`;

  const confirmed = await confirmAction({ title: "Delete folder?", message, confirmLabel: "Delete folder" });
  if (!confirmed) {
    return;
  }
  try {
    await api.bookmarks.removeTree(folder.id);
    await removeNotes(collectBookmarkIds(folder.children, []));
    if (state.collapsed.delete(folder.id)) {
      persistCollapsed();
    }
    showToast(`Deleted folder “${folder.title}”`, "success");
  } catch (error) {
    console.error("Failed to delete folder:", error);
    showToast(`Couldn't delete “${folder.title}”: ${errorMessage(error)}`, "error");
  }
}

// ---------------------------------------------------------------------------
// Add / edit dialog
// ---------------------------------------------------------------------------

const DIALOG_TEXT = {
  "add-bookmark": { heading: "Add bookmark", submit: "Add bookmark" },
  "edit-bookmark": { heading: "Edit bookmark", submit: "Save" },
  "add-folder": { heading: "New folder", submit: "Create folder" },
  "edit-folder": { heading: "Rename folder", submit: "Save" }
};

function buildFolderOptions(select, selectedId, excludedFolderId) {
  select.replaceChildren();
  const addOptions = (nodes, depth) => {
    for (const node of nodes) {
      // Skip a folder being edited (and its subfolders): it can't move into itself.
      if (node.type !== TYPE_FOLDER || node.readOnly || node.id === excludedFolderId) {
        continue;
      }
      const option = document.createElement("option");
      option.value = node.id;
      option.textContent = " ".repeat(depth) + (node.title || "Untitled folder");
      select.append(option);
      addOptions(node.children, depth + 1);
    }
  };
  addOptions(state.topLevel, 0);
  select.value = selectedId;
  if (select.selectedIndex === -1 && select.options.length > 0) {
    select.selectedIndex = 0;
  }
}

// mode: "add-bookmark" | "edit-bookmark" | "add-folder" | "edit-folder"
function openEditDialog(mode, { node = null, parentId = null } = {}) {
  const isFolder = mode.endsWith("folder");
  const titleInput = $("edit-title");
  const urlInput = $("edit-url");

  dialogState = { mode, node };
  $("edit-dialog-title").textContent = DIALOG_TEXT[mode].heading;
  $("edit-submit").textContent = DIALOG_TEXT[mode].submit;
  $("edit-title-label").textContent = isFolder ? "Folder name" : "Title";
  titleInput.placeholder = isFolder ? "e.g. Work" : "Optional, uses the URL if left blank";
  titleInput.value = node ? node.title : "";
  $("edit-url-field").hidden = isFolder;
  urlInput.value = node && node.url ? node.url : "";
  $("edit-error").textContent = "";

  const selectedParent = node ? node.parentId : parentId || defaultFolderId();
  buildFolderOptions($("edit-parent"), selectedParent, mode === "edit-folder" ? node.id : null);

  $("edit-dialog").showModal();
  const firstField = isFolder ? titleInput : urlInput;
  firstField.focus();
  firstField.select();
}

async function submitEditDialog() {
  const { mode, node } = dialogState;
  const isFolder = mode.endsWith("folder");
  const title = $("edit-title").value.trim();
  const parentId = $("edit-parent").value;

  if (!parentId) {
    throw new Error("Choose a folder.");
  }

  if (isFolder) {
    if (!title) {
      throw new Error("Enter a folder name.");
    }
    if (mode === "add-folder") {
      await api.bookmarks.create({ parentId, title });
      expandFolder(parentId);
      showToast(`Created folder “${title}”`, "success");
    } else {
      if (title !== node.title) {
        await api.bookmarks.update(node.id, { title });
      }
      if (parentId !== node.parentId) {
        await api.bookmarks.move(node.id, { parentId });
        expandFolder(parentId);
      }
      showToast(`Updated folder “${title}”`, "success");
    }
  } else {
    const url = normalizeUrl($("edit-url").value);
    const finalTitle = title || url;
    if (mode === "add-bookmark") {
      await api.bookmarks.create({ parentId, title: finalTitle, url });
      expandFolder(parentId);
      showToast(`Added “${finalTitle}”`, "success");
    } else {
      if (finalTitle !== node.title || url !== node.url) {
        await api.bookmarks.update(node.id, { title: finalTitle, url });
      }
      if (parentId !== node.parentId) {
        await api.bookmarks.move(node.id, { parentId });
        expandFolder(parentId);
      }
      showToast(`Updated “${finalTitle}”`, "success");
    }
  }

  await rememberFolder(parentId);
}

function initDialogs() {
  const dialog = $("edit-dialog");
  const submitButton = $("edit-submit");

  $("edit-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!dialogState || submitButton.disabled) {
      return;
    }
    submitButton.disabled = true;
    $("edit-error").textContent = "";
    try {
      await submitEditDialog();
      dialog.close();
    } catch (error) {
      console.error("Failed to save:", error);
      $("edit-error").textContent = errorMessage(error);
    } finally {
      submitButton.disabled = false;
    }
  });

  $("edit-cancel").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    dialogState = null;
  });
}

// ---------------------------------------------------------------------------
// Drag and drop (list view)
// ---------------------------------------------------------------------------

function setDropTarget(group) {
  if (!dragState || dragState.dropTarget === group) {
    return;
  }
  if (dragState.dropTarget) {
    dragState.dropTarget.classList.remove("is-drop-target");
  }
  clearTimeout(dragState.expandTimer);
  dragState.dropTarget = group;
  if (group) {
    group.classList.add("is-drop-target");
    // Hovering over a closed folder opens it, so items can go into subfolders.
    if (!group.open) {
      dragState.expandTimer = setTimeout(() => {
        group.open = true;
      }, DRAG_EXPAND_DELAY_MS);
    }
  }
}

function startDrag(event, node, element) {
  dragState = { id: node.id, dropTarget: null, expandTimer: null };
  event.dataTransfer.effectAllowed = "move";
  // A custom type (rather than text/plain) stops the item being dropped into
  // note boxes as text. Firefox needs some data set to start a drag at all.
  event.dataTransfer.setData(BOOKMARK_DRAG_TYPE, node.id);
  event.dataTransfer.setDragImage(element, 20, 20);
  element.classList.add("is-dragging");
  document.body.classList.add("is-dragging-bookmark");
}

function endDrag() {
  if (!dragState) {
    return;
  }
  setDropTarget(null);
  clearTimeout(dragState.expandTimer);
  for (const element of document.querySelectorAll(".is-dragging")) {
    element.classList.remove("is-dragging");
  }
  document.body.classList.remove("is-dragging-bookmark");
  dragState = null;

  if (refreshAfterDrag) {
    refreshAfterDrag = false;
    scheduleRefresh();
  }
}

function createDragHandle(node, draggedElement) {
  const handle = createIconSlot("grip", "drag-handle");
  handle.draggable = true;
  handle.title = "Drag onto a folder to move";
  // Keyboard users move items with the edit dialog's Folder field instead.
  handle.setAttribute("aria-hidden", "true");
  handle.addEventListener("dragstart", (event) => {
    event.stopPropagation();
    startDrag(event, node, draggedElement);
  });
  handle.addEventListener("dragend", endDrag);
  // Clicking the grip on a folder row shouldn't open or close the folder.
  handle.addEventListener("click", (event) => event.preventDefault());
  return handle;
}

function attachFolderDropHandlers(group, folder) {
  group.addEventListener("dragover", (event) => {
    if (!dragState) {
      return;
    }
    // The innermost folder under the pointer handles the drop.
    event.stopPropagation();
    if (!canMoveInto(dragState.id, folder.id)) {
      setDropTarget(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget(group);
  });

  group.addEventListener("drop", (event) => {
    if (!dragState) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const nodeId = dragState.id;
    endDrag();
    if (canMoveInto(nodeId, folder.id)) {
      moveNode(nodeId, folder.id);
    }
  });
}

function initDragContainer() {
  // Dragging over empty space outside any folder clears the highlight.
  $("bookmark-list").addEventListener("dragover", () => {
    if (dragState) {
      setDropTarget(null);
    }
  });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function createBookmarkCard(bookmark, { inTree }) {
  const card = createElement("article", "bookmark-item");
  card.dataset.bookmarkId = bookmark.id;
  card.style.setProperty("--hue", String(hashHue(hostOf(bookmark.url))));

  if (inTree && !bookmark.fixed) {
    card.append(createDragHandle(bookmark, card));
  }

  const avatar = createElement("span", "bookmark-avatar", avatarLetter(bookmark.title));
  avatar.setAttribute("aria-hidden", "true");

  const main = createElement("div", "bookmark-main");
  const title = createElement("a", "bookmark-title", bookmark.title);
  title.href = bookmark.url;
  title.title = bookmark.title;
  const url = createElement("div", "bookmark-url", formatUrlForDisplay(bookmark.url));
  url.title = bookmark.url;
  main.append(title, url);

  if (!inTree && bookmark.folder) {
    const folder = createElement("span", "bookmark-folder");
    folder.title = bookmark.folder;
    folder.append(createIcon("folder"), createElement("span", "bookmark-folder-path", bookmark.folder));
    main.append(folder);
  }

  const note = createElement("textarea", "bookmark-note");
  note.placeholder = "Add a note…";
  note.rows = 1;
  note.value = state.notes[bookmark.id] || "";
  note.setAttribute("aria-label", `Note for ${bookmark.title}`);

  const noteStatus = createElement("div", "bookmark-note-status");
  noteStatus.setAttribute("aria-live", "polite");

  note.addEventListener("input", () => scheduleNoteSave(bookmark.id, note, noteStatus));
  note.addEventListener("blur", () => flushNote(bookmark.id));

  card.append(avatar, main, note, noteStatus);

  if (!bookmark.fixed) {
    const actions = createElement("div", "bookmark-actions");
    actions.append(
      createIconButton("pencil", `Edit ${bookmark.title}`, () => openEditDialog("edit-bookmark", { node: state.nodesById.get(bookmark.id) })),
      createIconButton("trash", `Delete ${bookmark.title}`, () => deleteBookmark(bookmark), "icon-btn-danger")
    );
    card.append(actions);
  }

  return card;
}

function createFolderGroup(folder, depth) {
  const fullFolder = state.nodesById.get(folder.id) || folder;
  const group = createElement("details", "bookmark-folder-group");
  group.dataset.folderId = folder.id;
  group.dataset.depth = String(depth);
  group.style.setProperty("--hue", String(hashHue(folder.id)));
  // Searching opens every folder that has a match.
  group.open = Boolean(state.query) || !state.collapsed.has(folder.id);

  group.addEventListener("toggle", () => {
    const wasOpen = !state.collapsed.has(folder.id);
    if (state.query || group.open === wasOpen) {
      return;
    }
    if (group.open) {
      state.collapsed.delete(folder.id);
    } else {
      state.collapsed.add(folder.id);
    }
    persistCollapsed();
  });

  const header = createElement("summary", "bookmark-folder-header");
  header.append(
    folder.fixed ? createElement("span", "drag-handle-spacer") : createDragHandle(fullFolder, header),
    createIconSlot("chevron", "folder-chevron"),
    createIconSlot("folder", "folder-icon"),
    createElement("span", "bookmark-folder-title", folder.title || "Untitled folder"),
    createElement("span", "bookmark-folder-count", String(fullFolder.bookmarkCount))
  );

  if (!folder.readOnly) {
    const name = folder.title || "folder";
    const actions = createElement("span", "folder-actions");
    actions.append(
      createIconButton("plus", `Add bookmark to ${name}`, () => openEditDialog("add-bookmark", { parentId: folder.id })),
      createIconButton("folderPlus", `New folder inside ${name}`, () => openEditDialog("add-folder", { parentId: folder.id }))
    );
    if (!folder.fixed) {
      actions.append(
        createIconButton("pencil", `Rename ${name}`, () => openEditDialog("edit-folder", { node: fullFolder })),
        createIconButton("trash", `Delete ${name}`, () => deleteFolder(fullFolder), "icon-btn-danger")
      );
    }
    header.append(actions);
  }

  const children = createElement("div", "bookmark-folder-children");
  appendTreeNodes(children, folder.children, depth + 1);

  group.append(header, children);
  attachFolderDropHandlers(group, folder);
  return group;
}

function appendTreeNodes(parent, nodes, depth) {
  // Keeps the user's own bookmark order, as arranged in the browser.
  for (const node of nodes) {
    if (node.type === TYPE_FOLDER) {
      parent.append(createFolderGroup(node, depth));
    } else {
      parent.append(createBookmarkCard(node, { inTree: true }));
    }
  }
}

function renderMessage(container, message) {
  const empty = createElement("div", "empty-state");
  empty.append(createIconSlot("bookmark"), createElement("p", "", message));
  container.replaceChildren(empty);
}

function countTreeBookmarks(nodes) {
  let count = 0;
  for (const node of nodes) {
    count += node.type === TYPE_BOOKMARK ? 1 : countTreeBookmarks(node.children);
  }
  return count;
}

function captureNoteFocus() {
  const active = document.activeElement;
  if (!active || !active.classList || !active.classList.contains("bookmark-note")) {
    return null;
  }
  const card = active.closest(".bookmark-item");
  return card ? { id: card.dataset.bookmarkId, start: active.selectionStart, end: active.selectionEnd } : null;
}

function restoreNoteFocus(container, focus) {
  if (!focus) {
    return;
  }
  const textarea = container.querySelector(`.bookmark-item[data-bookmark-id="${CSS.escape(focus.id)}"] .bookmark-note`);
  if (textarea) {
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(focus.start, focus.end);
  }
}

function renderBookmarks() {
  const container = $("bookmark-list");
  const countElement = $("bookmark-count");
  const query = state.query;
  const focus = captureNoteFocus();

  container.dataset.view = state.view;
  document.body.dataset.view = state.view;

  const total = collectBookmarkIds(state.topLevel, []).length;
  const fragment = document.createDocumentFragment();
  let visible;

  if (state.view === VIEW_LIST) {
    // Hide built-in folders that are empty (e.g. "Mobile bookmarks").
    const nodes = query
      ? filterTree(state.topLevel, query)
      : state.topLevel.filter((node) => node.type !== TYPE_FOLDER || node.children.length > 0);
    visible = countTreeBookmarks(nodes);
    appendTreeNodes(fragment, nodes, 0);
  } else {
    const bookmarks = flattenBookmarks(state.topLevel, [], []).filter((bookmark) => !query || bookmarkMatches(bookmark, query));
    visible = bookmarks.length;
    for (const bookmark of sortBookmarks(bookmarks)) {
      fragment.append(createBookmarkCard(bookmark, { inTree: false }));
    }
  }

  countElement.textContent = query ? `${visible} of ${plural(total, "bookmark")}` : plural(total, "bookmark");

  if (!fragment.hasChildNodes()) {
    renderMessage(
      container,
      query
        ? `Nothing matches “${$("search-input").value.trim()}”.`
        : "No bookmarks yet. Use Add bookmark to create your first one."
    );
    return;
  }

  container.replaceChildren(fragment);
  restoreNoteFocus(container, focus);
}

// ---------------------------------------------------------------------------
// Cross-tab sync: keep other open New Tab pages up to date.
// ---------------------------------------------------------------------------

function handleStorageChange(changes, areaName) {
  if (areaName !== "local") {
    return;
  }

  for (const [key, change] of Object.entries(changes)) {
    const newValue = typeof change.newValue === "string" ? change.newValue : "";

    if (key === CSS_STORAGE_KEY) {
      applyCustomCss(newValue);
      const editor = $("css-editor");
      if (document.activeElement !== editor) {
        editor.value = newValue;
      }
    } else if (key.startsWith(NOTE_KEY_PREFIX)) {
      const bookmarkId = key.slice(NOTE_KEY_PREFIX.length);
      const card = document.querySelector(`.bookmark-item[data-bookmark-id="${CSS.escape(bookmarkId)}"]`);
      const textarea = card ? card.querySelector(".bookmark-note") : null;
      if (textarea && document.activeElement !== textarea && textarea.value !== newValue) {
        textarea.value = newValue;
        state.notes[bookmarkId] = newValue;
      }
    }
  }
}

function initBookmarkListeners() {
  // Covers changes made here and anywhere else (bookmark manager, other tabs).
  // Firefox doesn't have every event, so each is optional.
  const events = ["onCreated", "onRemoved", "onChanged", "onMoved", "onChildrenReordered", "onImportEnded"];
  for (const eventName of events) {
    const event = api.bookmarks[eventName];
    if (event && typeof event.addListener === "function") {
      event.addListener(scheduleRefresh);
    }
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
  hydrateIcons(document);

  // Apply the theme and view first so bookmarks render already styled.
  let stored = {};
  try {
    stored = await api.storage.local.get([CSS_STORAGE_KEY, VIEW_STORAGE_KEY, COLLAPSED_STORAGE_KEY, LAST_FOLDER_STORAGE_KEY]);
  } catch (error) {
    console.error("Failed to load settings:", error);
  }

  const initialCss = typeof stored[CSS_STORAGE_KEY] === "string" ? stored[CSS_STORAGE_KEY] : "";
  applyCustomCss(initialCss);
  state.view = VIEW_MODES.includes(stored[VIEW_STORAGE_KEY]) ? stored[VIEW_STORAGE_KEY] : VIEW_GRID;
  state.collapsed = new Set(Array.isArray(stored[COLLAPSED_STORAGE_KEY]) ? stored[COLLAPSED_STORAGE_KEY] : []);
  state.lastFolderId = typeof stored[LAST_FOLDER_STORAGE_KEY] === "string" ? stored[LAST_FOLDER_STORAGE_KEY] : null;

  initSettingsPanel(initialCss);
  initViewToggle();
  initSearch();
  initToolbar();
  initDialogs();
  initDragContainer();
  api.storage.onChanged.addListener(handleStorageChange);
  initBookmarkListeners();

  await refresh();
}

init();
