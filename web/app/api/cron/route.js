import { equal } from "../../../lib/auth.mjs";
import { transact } from "../../../lib/store.mjs";
import { runDiscovery } from "../../../lib/discovery-run.mjs";
import { autoBlockers } from "../../../lib/model.mjs";
import { sendApproved } from "../../../lib/submissions.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
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
    return Response.json(result);
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
