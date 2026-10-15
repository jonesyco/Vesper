import { test } from "node:test";
import assert from "node:assert/strict";
import { wheelAction, GESTURE_GAP_MS, pathScrollTop } from "../../js/lib/wheel.js";

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

// Minimal stand-ins for DOM elements: only scrollTop and parentElement are read.
function chain(...scrollTops) {
  let parent = null;
  const nodes = [];
  for (const scrollTop of scrollTops.reverse()) {
    parent = { scrollTop, parentElement: parent };
    nodes.unshift(parent);
  }
  return nodes; // nodes[0] is the innermost (event target), last is the sheet body
}

test("pathScrollTop is the sheet body's scrollTop when nothing inside is scrolled", () => {
  const [target, , body] = chain(0, 0, 0);
  body.scrollTop = 0;
  assert.equal(pathScrollTop(target, body), 0);
});

test("a scrolled note inside the sheet counts, so wheel-up scrolls the note instead of closing", () => {
  const [note, card, body] = chain(200, 0, 0);
  assert.equal(pathScrollTop(note, body), 200);
  assert.equal(wheelAction({ open: true, deltaY: -40, scrollTop: pathScrollTop(note, body), ...fresh }), null);
  void card;
});

test("pathScrollTop stops at the sheet body and ignores ancestors above it", () => {
  const [target, body, outside] = chain(0, 0, 500);
  assert.equal(pathScrollTop(target, body), 0);
  void outside;
});

test("a target outside the sheet just reads up to the root", () => {
  const [target] = chain(0, 0);
  assert.equal(pathScrollTop(target, { scrollTop: 0 }), 0);
});
