import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl, looksLikeUrl, searchText, toNavigableUrl } from "../../js/lib/url.js";

test("normalizeUrl adds https:// when no scheme is given", () => {
  assert.equal(normalizeUrl("example.com"), "https://example.com/");
});

test("normalizeUrl keeps an existing scheme", () => {
  assert.equal(normalizeUrl("http://example.com/a"), "http://example.com/a");
  assert.equal(normalizeUrl("mailto:me@example.com"), "mailto:me@example.com");
});

test("normalizeUrl trims whitespace", () => {
  assert.equal(normalizeUrl("  example.com  "), "https://example.com/");
});

test("normalizeUrl rejects empty input", () => {
  assert.throws(() => normalizeUrl("   "), /Enter a URL/);
});

test("normalizeUrl rejects unsupported schemes", () => {
  assert.throws(() => normalizeUrl("javascript://alert(1)"), /Only http, https, ftp and mailto/);
});

test("looksLikeUrl accepts addresses", () => {
  for (const text of [
    "example.com", "www.example.co.uk/path?q=1", "http://intranet", "localhost",
    "localhost:3000/app", "192.168.1.1", "10.0.0.2:8080", "github.com/jonesyco/NewTab",
    "mailto:me@example.com", "bücher.de"
  ]) {
    assert.equal(looksLikeUrl(text), true, text);
  }
});

test("looksLikeUrl sends ordinary queries to search", () => {
  for (const text of ["", "   ", "weather", "how to cook rice", "what is example.com", "c++", "1.5", "3.14 pi"]) {
    assert.equal(looksLikeUrl(text), false, text);
  }
});

test("looksLikeUrl treats a bare file name as a search (Review Focus 1)", () => {
  for (const text of ["node.js", "readme.md", "setup.py", "notes.txt", "package.json"]) {
    assert.equal(looksLikeUrl(text), false, text);
  }
  // With a path or port it's clearly an address again.
  assert.equal(looksLikeUrl("node.js/docs"), true);
});

test("a leading ? always forces a search", () => {
  assert.equal(looksLikeUrl("?example.com"), false);
  assert.equal(searchText("?example.com"), "example.com");
  assert.equal(searchText("? weather"), "weather");
  assert.equal(searchText("  weather  "), "weather");
});

test("toNavigableUrl uses http for local hosts and https otherwise", () => {
  assert.equal(toNavigableUrl("localhost:3000"), "http://localhost:3000/");
  assert.equal(toNavigableUrl("192.168.1.1"), "http://192.168.1.1/");
  assert.equal(toNavigableUrl("example.com"), "https://example.com/");
  assert.equal(toNavigableUrl("http://example.com"), "http://example.com/");
});
