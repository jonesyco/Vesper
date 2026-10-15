export function normalizeUrl(input) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Enter a URL.");
  }
  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed);
  let parsed;
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }
  if (!["http:", "https:", "ftp:", "mailto:"].includes(parsed.protocol)) {
    throw new Error("Only http, https, ftp and mailto links can be added here.");
  }
  return parsed.href;
}
