import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, mergeSettings } from "../../js/lib/settings-schema.js";

test("defaults match the spec", () => {
  assert.deepEqual({ ...DEFAULTS, hiddenTopSites: [...DEFAULTS.hiddenTopSites] }, {
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
    hiddenTopSites: [],
    openSheetOnStart: false
  });
});

test("missing or non-object input gives the defaults", () => {
  for (const input of [undefined, null, "x", 3, []]) {
    assert.deepEqual(mergeSettings(input), mergeSettings({}));
    assert.equal(mergeSettings(input).topSitesCount, 8);
  }
});

test("valid stored values win over defaults", () => {
  const merged = mergeSettings({ name: "Jon", topSitesCount: 0, photoFrequency: "hourly", darken: 60, hiddenTopSites: ["https://a.com/"] });
  assert.equal(merged.name, "Jon");
  assert.equal(merged.topSitesCount, 0);
  assert.equal(merged.photoFrequency, "hourly");
  assert.equal(merged.darken, 60);
  assert.deepEqual(merged.hiddenTopSites, ["https://a.com/"]);
});

test("invalid values fall back per key, others are kept", () => {
  const merged = mergeSettings({
    name: "Jon",
    topSitesCount: "8",
    darken: 61,
    timeFormat: "36h",
    showClock: "yes",
    hiddenTopSites: ["ok", 5]
  });
  assert.equal(merged.name, "Jon");
  assert.equal(merged.topSitesCount, 8);
  assert.equal(merged.darken, 25);
  assert.equal(merged.timeFormat, "auto");
  assert.equal(merged.showClock, true);
  assert.deepEqual(merged.hiddenTopSites, []);
});

test("non-integer numbers and over-long names are rejected", () => {
  const merged = mergeSettings({ topSitesCount: 2.5, darken: -1, name: "x".repeat(41) });
  assert.equal(merged.topSitesCount, 8);
  assert.equal(merged.darken, 25);
  assert.equal(merged.name, "");
});

test("unknown keys are dropped", () => {
  assert.equal("weather" in mergeSettings({ weather: true }), false);
});

test("result does not share arrays with the input or defaults", () => {
  const stored = { hiddenTopSites: ["https://a.com/"] };
  const merged = mergeSettings(stored);
  merged.hiddenTopSites.push("https://b.com/");
  assert.deepEqual(stored.hiddenTopSites, ["https://a.com/"]);
  assert.deepEqual(DEFAULTS.hiddenTopSites, []);
});

test("blur accepts even integers from 0 to 20 and falls back to 0", () => {
  assert.equal(mergeSettings({ blur: 0 }).blur, 0);
  assert.equal(mergeSettings({ blur: 12 }).blur, 12);
  assert.equal(mergeSettings({ blur: 20 }).blur, 20);
  for (const bad of [21, -2, 3, 4.5, "8", null]) {
    assert.equal(mergeSettings({ blur: bad }).blur, 0, String(bad));
  }
});
