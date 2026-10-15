import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { BUNDLED_PHOTOS } from "../../js/lib/bundled-photos.js";

test("there are 12 bundled photos with unique ids", () => {
  assert.equal(BUNDLED_PHOTOS.length, 12);
  assert.equal(new Set(BUNDLED_PHOTOS.map((photo) => photo.id)).size, 12);
});

test("every bundled photo file exists and has a credit", () => {
  for (const photo of BUNDLED_PHOTOS) {
    assert.ok(existsSync(new URL(`../../${photo.file}`, import.meta.url)), photo.file);
    assert.ok(photo.credit.trim().length > 0, `${photo.id} credit`);
    assert.match(photo.source, /^https:\/\/unsplash\.com\/photos\/[^<>]+$/);
    assert.doesNotMatch(photo.credit, /[<>]/, `${photo.id} credit is still a placeholder`);
    assert.equal(photo.id.startsWith("user:"), false);
  }
});
