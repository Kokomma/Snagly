import { requireOwner } from "../../../lib/auth.mjs";
import { transact, setupStatus } from "../../../lib/store.mjs";
import { analyze, autoBlockers } from "../../../lib/model.mjs";
import { schema, mutate } from "../../../lib/actions.mjs";
import { runDiscovery } from "../../../lib/discovery-run.mjs";
import { sendApproved } from "../../../lib/submissions.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req) {
  try {
    requireOwner(req);
    const state = await transact(
      (s) => ({
        ...s,
        jobs: s.jobs.map((j) => ({
          ...j,
          match: analyze(j, s.profile, s.preferences),
        })),
        applications: s.applications.map((a) => ({
          ...a,
          blockers: autoBlockers(s, a),
        })),
      }),
      { readOnly: true },
    );
    return Response.json(
      { state, setup: setupStatus() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json(
      { error: e.message, setup: setupStatus() },
      {
        status: e.message.includes("Sign in") ? 401 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
export async function POST(req) {
  try {
    requireOwner(req);
    const raw = await req.text();
    if (raw.length > 100000) throw new Error("Request is too large.");
    const parsed = JSON.parse(raw),
      body = schema.parse(parsed);
    if (body.action === "submit")
      await sendApproved(body.id, { revision: parsed.revision });
    else if (body.action === "discover")
      await runDiscovery({ revision: parsed.revision });
    else
      await transact(async (s) => {
        if (parsed.revision !== s.revision)
          throw new Error("Workspace changed. Refresh and try again.");
        mutate(s, body);
      });
    return Response.json({ ok: true });
  } catch (e) {
    const message =
      e.name === "ZodError"
        ? "Please check the form fields and required confirmations."
        : e.message;
    return Response.json({ error: message }, { status: 400 });
  }
}
