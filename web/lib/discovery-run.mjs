import { transact } from "./store.mjs";
import { discover } from "./sources.mjs";
import { backgroundPrepare } from "./actions.mjs";
import { reserveHiringCafeHour } from "./source-reservations.mjs";
// Network reads stay outside Firestore's retryable transaction callback.
export async function runDiscovery({ scheduled = false, revision } = {}) {
  let snapshot = await transact((s) => structuredClone(s), {
    readOnly: true,
  });
  if (revision !== undefined && revision !== snapshot.revision)
    throw new Error("Workspace changed. Refresh and try again.");
  if (
    scheduled &&
    snapshot.lastRun &&
    Date.now() - Date.parse(snapshot.lastRun) < 30 * 60 * 1000
  )
    return { skipped: true };
  let skipSourceIds = [];
  if (snapshot.sources.some((s) => s.enabled && s.type === "hiringcafe")) {
    const reserved = await transact((s) => {
      if (s.revision !== snapshot.revision)
        throw new Error("Workspace changed. Refresh and try again.");
      const skip = reserveHiringCafeHour(s);
      const copy = structuredClone(s);
      copy.revision = s.revision + 1;
      return { snapshot: copy, skip };
    });
    snapshot = reserved.snapshot;
    skipSourceIds = reserved.skip;
  }
  const expected = snapshot.revision,
    result = await discover(snapshot, fetch, { skipSourceIds });
  backgroundPrepare(snapshot);
  await transact((s) => {
    if (s.revision !== expected)
      throw new Error(
        "Workspace changed during discovery. Run discovery again.",
      );
    Object.assign(s, snapshot);
  });
  return result;
}
