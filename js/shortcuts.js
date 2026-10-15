import { $, isTypingTarget } from "./ui.js";

function focusSearchField() {
  const sheetOpen = document.body.dataset.sheet === "open";
  const field = sheetOpen ? $("search-input") : $("start-search");
  if (field.closest("[hidden]")) {
    return;
  }
  field.focus();
}

export function initShortcuts() {
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (document.querySelector("dialog[open]") || isTypingTarget(event.target)) {
      return;
    }
    if (event.key === "/") {
      event.preventDefault();
      focusSearchField();
    }
  });
}
