import { test } from "node:test";
import assert from "node:assert/strict";
import { fitWithin, MAX_PHOTO_EDGE, THUMB_EDGE } from "../../js/lib/image-size.js";

test("limits match the spec", () => {
  assert.equal(MAX_PHOTO_EDGE, 2560);
  assert.equal(THUMB_EDGE, 256);
});

test("small images are never upscaled", () => {
  assert.deepEqual(fitWithin(800, 600, 2560), { width: 800, height: 600 });
});

test("landscape is limited by width, keeping the aspect ratio", () => {
  assert.deepEqual(fitWithin(8000, 4000, 2560), { width: 2560, height: 1280 });
});

test("portrait is limited by height", () => {
  assert.deepEqual(fitWithin(3000, 6000, 2560), { width: 1280, height: 2560 });
});

test("huge panoramas never shrink a side below 1 px (Review Focus 4)", () => {
  assert.deepEqual(fitWithin(40000, 10, 256), { width: 256, height: 1 });
});

test("zero, negative or NaN sizes throw", () => {
  for (const [width, height] of [[0, 10], [10, -1], [Number.NaN, 10], [Infinity, 10]]) {
    assert.throws(() => fitWithin(width, height, 256), /no size/);
  }
});
