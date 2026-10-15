export const MAX_PHOTO_EDGE = 2560;
export const THUMB_EDGE = 256;

// Scales a size down (never up) so its longest side is at most maxEdge.
export function fitWithin(width, height, maxEdge) {
  if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)) {
    throw new Error("Image has no size.");
  }
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}
