import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl } from "../../js/lib/url.js";

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
