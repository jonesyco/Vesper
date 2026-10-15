// Wheel events closer together than this belong to one gesture (including
// trackpad momentum). Only a new gesture may open or close the sheet.
export const GESTURE_GAP_MS = 250;

export function wheelAction({ open, deltaY, scrollTop, now, lastWheelAt }) {
  if (now - lastWheelAt < GESTURE_GAP_MS) {
    return null;
  }
  if (!open) {
    return deltaY > 0 ? "open" : null;
  }
  return deltaY < 0 && scrollTop <= 0 ? "close" : null;
}

// Largest scroll offset from `target` up to and including `stop` (the sheet
// body). A scrolled note or list inside the sheet counts, so wheeling up
// scrolls it back first instead of closing the sheet.
export function pathScrollTop(target, stop) {
  let largest = 0;
  for (let node = target; node; node = node.parentElement) {
    largest = Math.max(largest, node.scrollTop || 0);
    if (node === stop) {
      break;
    }
  }
  return largest;
}
