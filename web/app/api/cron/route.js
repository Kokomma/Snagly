import { processAIQueue } from "../../../lib/ai.mjs";
import { withWorkspace } from "../../../lib/workspace-context.mjs";
import { equal } from "../../../lib/auth.mjs";
import { transact, scheduledAccounts, reserveHourlyStorage } from "../../../lib/store.mjs";
import { forEachWorkspace } from "../../../lib/hourly-accounts.mjs";
import { accountAuth } from "../../../lib/account-auth.mjs";
import { runDiscovery } from "../../../lib/discovery-run.mjs";
import { autoBlockers } from "../../../lib/model.mjs";
import { sendApproved } from "../../../lib/submissions.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(req) {
  if (
    !process.env.CRON_SECRET ||
    !equal(
      req.headers.get("authorization") || "",
      `Bearer ${process.env.CRON_SECRET}`,
    )
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const identities = await scheduledAccounts();
    const results = await forEachWorkspace(identities, async (identity) => {
      const budget=await reserveHourlyStorage();
      if(!budget.allowed) return {skipped:true,reason:budget.reason};
      if (!identity.legacy) {
        const user = await accountAuth().getUser(identity.uid);
        if (user.disabled || !user.emailVerified) return { skipped: true };
        identity.email = user.email;
        identity.name = user.displayName || "";
      }
      await processAIQueue();
      const result = await runDiscovery({ scheduled: true });
      const ids = result.skipped
        ? []
        : await transact(
            (s) =>
              s.preferences.mode === "auto"
                ? s.applications
                    .filter((a) => !autoBlockers(s, a).length)
                    .slice(0, 3)
                    .map((a) => a.id)
                : [],
            { readOnly: true },
          );
      for (const id of ids) {
        try {
          await sendApproved(id, { automatic: true });
        } catch {
          /* Concurrent mode or preference changes can revoke a scheduled send. */
        }
      }
      return result;
    });
    return Response.json({
      accounts: results.length,
      completed: results.filter((x) => x.status === "fulfilled").length,
      failed: results.filter((x) => x.status === "rejected").length,
    });
  } catch {
    return Response.json(
      {
        error:
          "Scheduled run failed. Check database connectivity and source status.",
      },
      { status: 503 },
    );
  }
}
