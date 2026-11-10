import { transact } from "./store.mjs";
import { discover } from "./sources.mjs";
import { backgroundPrepare } from "./actions.mjs";
// Network reads stay outside Firestore's retryable transaction callback.
export async function runDiscovery({ scheduled = false, revision } = {}) {
  const snapshot = await transact((s) => structuredClone(s), {
    readOnly: true,
  });
  if (revision !== undefined && revision !== snapshot.revision)
    throw new Error("Workspace changed. Refresh and try again.");
  if (
    scheduled &&
    snapshot.lastRun &&
    Date.now() - Date.parse(snapshot.lastRun) < 50 * 60 * 1000
  )
    return { skipped: true };
  const expected = snapshot.revision,
    result = await discover(snapshot);
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
