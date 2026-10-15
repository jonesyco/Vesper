import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleTopSites } from "../../js/lib/top-sites.js";

const sites = [
  { url: "https://github.com/", title: "GitHub" },
  { url: "chrome://newtab/", title: "New Tab" },
  { url: "https://github.com/", title: "GitHub again" },
  { url: "file:///C:/notes.txt", title: "notes" },
  { url: "about:blank", title: "" },
  { url: "https://www.reddit.com/", title: "" },
  { url: "not a url", title: "bad" },
  { url: "https://example.com/", title: "Example" }
];

test("keeps only unique http(s) sites, in order (Review Focus 5)", () => {
  assert.deepEqual(visibleTopSites(sites, [], 12).map((site) => site.url), [
    "https://github.com/", "https://www.reddit.com/", "https://example.com/"
  ]);
});

test("missing titles fall back to the host without www", () => {
  assert.equal(visibleTopSites(sites, [], 12)[1].title, "reddit.com");
});

test("hidden sites are skipped and the count is still filled from later sites", () => {
  assert.deepEqual(visibleTopSites(sites, ["https://github.com/"], 2).map((site) => site.url), [
    "https://www.reddit.com/", "https://example.com/"
  ]);
});

test("count limits the result and 0 hides everything", () => {
  assert.equal(visibleTopSites(sites, [], 1).length, 1);
  assert.deepEqual(visibleTopSites(sites, [], 0), []);
});

test("empty or invalid input gives an empty list", () => {
  assert.deepEqual(visibleTopSites([], [], 8), []);
  assert.deepEqual(visibleTopSites(undefined, [], 8), []);
  assert.deepEqual(visibleTopSites([null, { title: "no url" }], [], 8), []);
});
