import { $ } from "./ui.js";
import { wheelAction, pathScrollTop } from "./lib/wheel.js";
import { getSettings } from "./settings-store.js";

const DRAG_THRESHOLD_PX = 60;
const CLICK_SLOP_PX = 4;

let open = false;
let lastWheelAt = -Infinity;
let drag = null; // { startY, dy, moved } while the handle is held

export function isSheetOpen() {
  return open;
}

function apply() {
  document.body.dataset.sheet = open ? "open" : "closed";
  $("sheet-handle").setAttribute("aria-expanded", String(open));
  $("sheet-body").inert = !open;
  $("start").inert = open;
}

export function setSheetOpen(next, { focus = true } = {}) {
  if (next === open) {
    return;
  }
  open = next;
  apply();
  if (focus) {
    (open ? $("search-input") : $("sheet-handle")).focus({ preventScroll: true });
  }
}

function initHandle() {
  const handle = $("sheet-handle");
  const sheet = $("sheet");

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    drag = { startY: event.clientY, dy: 0, moved: false };
    handle.setPointerCapture(event.pointerId);
    sheet.classList.add("is-dragging");
  });

  handle.addEventListener("pointermove", (event) => {
    if (!drag) {
      return;
    }
    drag.dy = event.clientY - drag.startY;
    drag.moved = drag.moved || Math.abs(drag.dy) > CLICK_SLOP_PX;
    sheet.style.setProperty("--drag-offset", `${drag.dy}px`);
  });

  const endDrag = (cancelled) => {
    if (!drag) {
      return;
    }
    const { dy, moved } = drag;
    drag = null;
    sheet.classList.remove("is-dragging");
    sheet.style.removeProperty("--drag-offset");
    if (cancelled) {
      return;
    }
    if (!moved) {
      setSheetOpen(!open);
    } else if (!open && dy < -DRAG_THRESHOLD_PX) {
      setSheetOpen(true);
    } else if (open && dy > DRAG_THRESHOLD_PX) {
      setSheetOpen(false);
    }
  };
  handle.addEventListener("pointerup", () => endDrag(false));
  handle.addEventListener("pointercancel", () => endDrag(true));

  // Enter/Space produce a click with detail 0; pointer clicks are handled above.
  handle.addEventListener("click", (event) => {
    if (event.detail === 0) {
      setSheetOpen(!open);
    }
  });
}

function initWheel() {
  window.addEventListener("wheel", (event) => {
    const now = performance.now();
    const body = $("sheet-body");
    const scrollTop = Math.max(body.scrollTop, event.target instanceof Element ? pathScrollTop(event.target, body) : 0);
    const action = wheelAction({ open, deltaY: event.deltaY, scrollTop, now, lastWheelAt });
    lastWheelAt = now;
    if (!action || document.querySelector("dialog[open]")) {
      return;
    }
    setSheetOpen(action === "open", { focus: false });
  }, { passive: true });
}

function initOutsideClick() {
  // The start page is inert while the sheet is open, so clicks on the strip
  // of photo above the sheet land on <body> or the backdrop.
  document.addEventListener("click", (event) => {
    if (open && !event.target.closest("#sheet, dialog, #toast-region")) {
      setSheetOpen(false);
    }
  });
}

export function initSheet() {
  const sheet = $("sheet");
  if (getSettings().openSheetOnStart) {
    // Open without animating on page load.
    sheet.classList.add("no-transition");
    open = true;
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.remove("no-transition")));
  }
  apply();
  initHandle();
  initWheel();
  initOutsideClick();
}
