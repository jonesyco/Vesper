export const PHOTO_FREQUENCIES = ["every-tab", "hourly", "daily"];
export const TIME_FORMATS = ["auto", "12h", "24h"];
export const DARKEN_MAX = 60;
export const BLUR_MAX = 20;
export const TOP_SITES_MAX = 12;
export const NAME_MAX_LENGTH = 40;

export const DEFAULTS = Object.freeze({
  bundledPhotos: true,
  photoFrequency: "daily",
  darken: 25,
  blur: 0,
  showClock: true,
  showDate: true,
  showGreeting: true,
  timeFormat: "auto",
  name: "",
  showSearch: true,
  searchSuggestions: true,
  topSitesCount: 8,
  hiddenTopSites: Object.freeze([]),
  openSheetOnStart: false
});

const isBoolean = (value) => typeof value === "boolean";
const isIntegerIn = (min, max) => (value) => Number.isInteger(value) && value >= min && value <= max;
const isOneOf = (list) => (value) => list.includes(value);

const VALIDATORS = {
  bundledPhotos: isBoolean,
  photoFrequency: isOneOf(PHOTO_FREQUENCIES),
  darken: isIntegerIn(0, DARKEN_MAX),
  // Even pixel steps, matching the slider.
  blur: (value) => isIntegerIn(0, BLUR_MAX)(value) && value % 2 === 0,
  showClock: isBoolean,
  showDate: isBoolean,
  showGreeting: isBoolean,
  timeFormat: isOneOf(TIME_FORMATS),
  name: (value) => typeof value === "string" && value.length <= NAME_MAX_LENGTH,
  showSearch: isBoolean,
  searchSuggestions: isBoolean,
  topSitesCount: isIntegerIn(0, TOP_SITES_MAX),
  hiddenTopSites: (value) => Array.isArray(value) && value.every((item) => typeof item === "string"),
  openSheetOnStart: isBoolean
};

// Stored values over defaults, key by key. Anything missing, invalid or out
// of range falls back to its default, so old or corrupt data can't break the page.
export function mergeSettings(stored) {
  const source = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  const result = {};
  for (const [key, fallback] of Object.entries(DEFAULTS)) {
    result[key] = Object.hasOwn(source, key) && VALIDATORS[key](source[key]) ? source[key] : fallback;
  }
  result.hiddenTopSites = [...result.hiddenTopSites];
  return result;
}
