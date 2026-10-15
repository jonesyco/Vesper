function pad(number) {
  return String(number).padStart(2, "0");
}

// Identifies the local day (daily) or local hour (hourly) a date falls in.
export function periodKey(date, frequency) {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return frequency === "hourly" ? `${day}T${pad(date.getHours())}` : day;
}

// Random photo from the pool, avoiding the previous one when there's a choice.
export function pickNext(pool, previousId, random = Math.random) {
  if (pool.length === 0) {
    return null;
  }
  const candidates = pool.length > 1 ? pool.filter((id) => id !== previousId) : pool;
  const index = Math.min(Math.floor(random() * candidates.length), candidates.length - 1);
  return candidates[index];
}

// Decides which photo to show. Keeps the stored one until its period ends,
// unless it has left the pool or a new pick is forced.
export function resolveBackground({ pool, state, frequency, now, force = false, random = Math.random }) {
  const valid = Boolean(state) && typeof state.id === "string" && typeof state.pickedAt === "number" && pool.includes(state.id);
  const expired = !valid || force || frequency === "every-tab" ||
    periodKey(new Date(state.pickedAt), frequency) !== periodKey(now, frequency);

  if (!expired) {
    return { id: state.id, pickedAt: state.pickedAt, changed: false };
  }
  const previousId = state && typeof state.id === "string" ? state.id : null;
  return { id: pickNext(pool, previousId, random), pickedAt: now.getTime(), changed: true };
}
