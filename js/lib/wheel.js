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
