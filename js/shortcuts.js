import { $, isTypingTarget } from "./ui.js";
import { isSheetOpen, setSheetOpen } from "./sheet.js";

function focusSearchField() {
  const field = isSheetOpen() ? $("search-input") : $("start-search");
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
    if (document.querySelector("dialog[open]")) {
      return;
    }
    const typing = isTypingTarget(event.target);

    if (event.key === "/" && !typing) {
      event.preventDefault();
      focusSearchField();
    } else if (event.key === "ArrowDown" && !typing && !isSheetOpen()) {
      event.preventDefault();
      setSheetOpen(true);
    } else if (event.key === "Escape" && isSheetOpen()) {
      event.preventDefault();
      setSheetOpen(false);
    }
  });
}
