import { $ } from "./ui.js";
import { greetingText, uses12Hour, formatTime, msUntilNextMinute } from "./lib/greeting.js";
import { getSettings, subscribe } from "./settings-store.js";

// A little past the minute, so the timer never fires a hair early.
const TICK_SLACK_MS = 50;

let timer = null;

function render() {
  const settings = getSettings();
  const now = new Date();
  const locale = navigator.language;

  const clock = $("clock");
  clock.hidden = !settings.showClock;
  clock.textContent = formatTime(now, uses12Hour(settings.timeFormat, locale));
  clock.dateTime = now.toISOString();

  const dateText = settings.showDate
    ? new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(now)
    : "";
  const greeting = settings.showGreeting ? greetingText(now.getHours(), settings.name) : "";
  $("date-text").textContent = dateText;
  $("greeting").textContent = greeting;
  $("date-sep").hidden = !(dateText && greeting);
  $("date-line").hidden = !(dateText || greeting);
}

function scheduleTick() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    render();
    scheduleTick();
  }, msUntilNextMinute(new Date()) + TICK_SLACK_MS);
}

export function initClock() {
  render();
  scheduleTick();
  subscribe(render);
  // Background tabs throttle timers; catch up as soon as the tab is shown.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      render();
      scheduleTick();
    }
  });
}
