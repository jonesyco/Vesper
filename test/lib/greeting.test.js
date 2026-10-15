import { test } from "node:test";
import assert from "node:assert/strict";
import { greetingFor, greetingText, uses12Hour, formatTime, msUntilNextMinute } from "../../js/lib/greeting.js";

test("greeting boundaries", () => {
  const cases = [
    [4, "Good night"], [5, "Good morning"], [11, "Good morning"],
    [12, "Good afternoon"], [16, "Good afternoon"],
    [17, "Good evening"], [21, "Good evening"],
    [22, "Good night"], [0, "Good night"]
  ];
  for (const [hour, expected] of cases) {
    assert.equal(greetingFor(hour), expected, `hour ${hour}`);
  }
});

test("greetingText adds a trimmed name only when there is one", () => {
  assert.equal(greetingText(9, "Jon"), "Good morning, Jon");
  assert.equal(greetingText(9, "  Jon  "), "Good morning, Jon");
  assert.equal(greetingText(9, "   "), "Good morning");
  assert.equal(greetingText(9, ""), "Good morning");
});

test("uses12Hour honours explicit formats", () => {
  assert.equal(uses12Hour("12h", "en-GB"), true);
  assert.equal(uses12Hour("24h", "en-US"), false);
});

test("uses12Hour auto follows the locale", () => {
  assert.equal(uses12Hour("auto", "en-US"), true);
  assert.equal(uses12Hour("auto", "en-GB"), false);
  assert.equal(uses12Hour("auto", "de-DE"), false);
});

test("formatTime 12-hour has no leading zero and maps 0 and 12 to 12", () => {
  assert.equal(formatTime(new Date(2026, 9, 14, 0, 5), true), "12:05");
  assert.equal(formatTime(new Date(2026, 9, 14, 9, 41), true), "9:41");
  assert.equal(formatTime(new Date(2026, 9, 14, 12, 0), true), "12:00");
  assert.equal(formatTime(new Date(2026, 9, 14, 23, 59), true), "11:59");
});

test("formatTime 24-hour pads hours", () => {
  assert.equal(formatTime(new Date(2026, 9, 14, 0, 5), false), "00:05");
  assert.equal(formatTime(new Date(2026, 9, 14, 23, 59), false), "23:59");
});

test("msUntilNextMinute", () => {
  assert.equal(msUntilNextMinute(new Date(2026, 9, 14, 9, 41, 0, 0)), 60000);
  assert.equal(msUntilNextMinute(new Date(2026, 9, 14, 9, 41, 59, 900)), 100);
});
