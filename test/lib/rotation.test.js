import { test } from "node:test";
import assert from "node:assert/strict";
import { periodKey, pickNext, resolveBackground } from "../../js/lib/rotation.js";

const at = (text) => new Date(text); // local time, no zone suffix

test("periodKey is per local day for daily and per hour for hourly", () => {
  assert.equal(periodKey(at("2026-10-14T09:59:00"), "daily"), "2026-10-14");
  assert.equal(periodKey(at("2026-10-14T09:59:00"), "hourly"), "2026-10-14T09");
});

test("pickNext never repeats the previous photo when there is a choice", () => {
  for (const random of [() => 0, () => 0.5, () => 0.999]) {
    assert.notEqual(pickNext(["a", "b", "c"], "a", random), "a");
  }
});

test("pickNext with one photo returns it even if it was previous", () => {
  assert.equal(pickNext(["a"], "a", () => 0.3), "a");
});

test("pickNext with an empty pool returns null", () => {
  assert.equal(pickNext([], null), null);
});

test("pickNext stays in range when random returns 1", () => {
  assert.equal(pickNext(["a", "b"], null, () => 1), "b");
});

const pool = ["a", "b", "c"];
const state = { id: "a", pickedAt: at("2026-10-14T09:10:00").getTime() };

test("daily keeps the photo within the same day", () => {
  const result = resolveBackground({ pool, state, frequency: "daily", now: at("2026-10-14T23:59:00") });
  assert.deepEqual(result, { id: "a", pickedAt: state.pickedAt, changed: false });
});

test("daily changes after midnight", () => {
  const now = at("2026-10-15T00:00:00");
  const result = resolveBackground({ pool, state, frequency: "daily", now, random: () => 0 });
  assert.equal(result.changed, true);
  assert.notEqual(result.id, "a");
  assert.equal(result.pickedAt, now.getTime());
});

test("hourly changes when the hour rolls over", () => {
  assert.equal(resolveBackground({ pool, state, frequency: "hourly", now: at("2026-10-14T09:59:00") }).changed, false);
  assert.equal(resolveBackground({ pool, state, frequency: "hourly", now: at("2026-10-14T10:00:00") }).changed, true);
});

test("every-tab always changes", () => {
  assert.equal(resolveBackground({ pool, state, frequency: "every-tab", now: at("2026-10-14T09:10:01") }).changed, true);
});

test("force picks a new photo even within the period", () => {
  const result = resolveBackground({ pool, state, frequency: "daily", now: at("2026-10-14T09:11:00"), force: true, random: () => 0 });
  assert.equal(result.changed, true);
  assert.notEqual(result.id, "a");
});

test("a stored photo that is no longer in the pool is replaced", () => {
  const result = resolveBackground({ pool: ["b", "c"], state, frequency: "daily", now: at("2026-10-14T09:11:00"), random: () => 0 });
  assert.equal(result.changed, true);
  assert.equal(result.id, "b");
});

test("missing or malformed state picks a photo", () => {
  for (const bad of [undefined, null, {}, { id: 3, pickedAt: "x" }]) {
    const result = resolveBackground({ pool, state: bad, frequency: "daily", now: at("2026-10-14T09:11:00"), random: () => 0 });
    assert.equal(result.changed, true);
    assert.equal(result.id, "a");
  }
});

test("an empty pool resolves to null", () => {
  assert.equal(resolveBackground({ pool: [], state, frequency: "daily", now: at("2026-10-14T09:11:00") }).id, null);
});
