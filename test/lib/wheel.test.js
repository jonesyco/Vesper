import { test } from "node:test";
import assert from "node:assert/strict";
import { wheelAction, GESTURE_GAP_MS } from "../../js/lib/wheel.js";

const fresh = { now: 10000, lastWheelAt: 10000 - GESTURE_GAP_MS };
const momentum = { now: 10000, lastWheelAt: 10000 - 16 };

test("scrolling down on the start page opens the sheet", () => {
  assert.equal(wheelAction({ open: false, deltaY: 40, scrollTop: 0, ...fresh }), "open");
});

test("scrolling up on the start page does nothing", () => {
  assert.equal(wheelAction({ open: false, deltaY: -40, scrollTop: 0, ...fresh }), null);
});

test("a fresh upward flick at the top of the sheet closes it", () => {
  assert.equal(wheelAction({ open: true, deltaY: -40, scrollTop: 0, ...fresh }), "close");
});

test("momentum arriving at the top does not close the sheet (Review Focus 2)", () => {
  assert.equal(wheelAction({ open: true, deltaY: -40, scrollTop: 0, ...momentum }), null);
});

test("scrolling up inside the list (not at top) does not close", () => {
  assert.equal(wheelAction({ open: true, deltaY: -40, scrollTop: 120, ...fresh }), null);
});

test("scrolling down inside the open sheet does nothing", () => {
  assert.equal(wheelAction({ open: true, deltaY: 40, scrollTop: 0, ...fresh }), null);
});

test("momentum after closing does not reopen", () => {
  assert.equal(wheelAction({ open: false, deltaY: 40, scrollTop: 0, ...momentum }), null);
});

test("the first wheel event ever counts as fresh", () => {
  assert.equal(wheelAction({ open: false, deltaY: 40, scrollTop: 0, now: 5, lastWheelAt: -Infinity }), "open");
});
