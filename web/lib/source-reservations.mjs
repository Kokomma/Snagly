export function reserveHiringCafeHour(state, at = Date.now()) {
  const hour = new Date(at).toISOString().slice(0, 13),
    skip = [];
  for (const source of state.sources.filter(
    (s) => s.enabled && s.type === "hiringcafe",
  )) {
    if (
      source.lastAttemptHour === hour ||
      (source.nextAttemptAt && Date.parse(source.nextAttemptAt) > at)
    )
      skip.push(source.id);
    else source.lastAttemptHour = hour;
  }
  return skip;
}
