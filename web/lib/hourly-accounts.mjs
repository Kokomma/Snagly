import { accountAuth } from "./account-auth.mjs";
import { withWorkspace } from "./workspace-context.mjs";
export async function forEachWorkspace(
  identities,
  run,
  { concurrency = 3 } = {},
) {
  let cursor = 0;
  const results = [];
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, identities.length) },
      async () => {
        while (cursor < identities.length) {
          const identity = identities[cursor++];
          try {
            if (!identity.legacy) {
              const user = await accountAuth().getUser(identity.uid);
              if (user.disabled || !user.emailVerified) {
                results.push({
                  uid: identity.uid,
                  status: "fulfilled",
                  value: { skipped: true },
                });
                continue;
              }
              identity.email = user.email;
              identity.name = user.displayName || "";
              identity.verified = true;
            }
            const value = await withWorkspace(identity, () => run(identity));
            results.push({ uid: identity.uid, status: "fulfilled", value });
          } catch {
            results.push({ uid: identity.uid, status: "rejected" });
          }
        }
      },
    ),
  );
  return results;
}
