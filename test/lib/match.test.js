import { test } from "node:test";
import assert from "node:assert/strict";
import { bookmarkMatches } from "../../js/lib/match.js";

const bookmark = { id: "7", title: "GitHub Home", url: "https://github.com/" };

test("matches on title, case-insensitively via lowercased query", () => {
  assert.equal(bookmarkMatches(bookmark, "home", {}), true);
});

test("matches on URL", () => {
  assert.equal(bookmarkMatches(bookmark, "github.com", {}), true);
});

test("matches on the bookmark's note", () => {
  assert.equal(bookmarkMatches(bookmark, "code review", { 7: "For Code Review links" }), true);
});

test("no match returns false, and a missing note is fine", () => {
  assert.equal(bookmarkMatches(bookmark, "gitlab", {}), false);
});
