export function greetingFor(hour) {
  if (hour >= 5 && hour < 12) {
    return "Good morning";
  }
  if (hour >= 12 && hour < 17) {
    return "Good afternoon";
  }
  if (hour >= 17 && hour < 22) {
    return "Good evening";
  }
  return "Good night";
}

export function greetingText(hour, name) {
  const trimmed = name.trim();
  return trimmed ? `${greetingFor(hour)}, ${trimmed}` : greetingFor(hour);
}

export function uses12Hour(format, locale) {
  if (format === "12h") {
    return true;
  }
  if (format === "24h") {
    return false;
  }
  const options = new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions();
  if (typeof options.hour12 === "boolean") {
    return options.hour12;
  }
  return options.hourCycle === "h11" || options.hourCycle === "h12";
}

// Hours and minutes only; Bonjourr-style, no AM/PM suffix.
export function formatTime(date, twelveHour) {
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const hours = date.getHours();
  return twelveHour ? `${hours % 12 || 12}:${minutes}` : `${String(hours).padStart(2, "0")}:${minutes}`;
}

export function msUntilNextMinute(date) {
  return 60000 - (date.getSeconds() * 1000 + date.getMilliseconds());
}
