import { tailorWithAI } from "../../../lib/ai.mjs";
import { withRequestWorkspace } from "../../../lib/auth.mjs";
import { transact, setupStatus } from "../../../lib/store.mjs";
import { analyze, autoBlockers } from "../../../lib/model.mjs";
import { schema, mutate } from "../../../lib/actions.mjs";
import { runDiscovery } from "../../../lib/discovery-run.mjs";
import { sendApproved } from "../../../lib/submissions.mjs";
import { workspaceSummary } from "../../../lib/workspace-view.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(req) {
  let signedIn;
  try {
    return await withRequestWorkspace(req, async (identity) => {
      signedIn = identity;
      if(req.headers.get("x-snagly-client")!=="2") { const e=new Error("Snagly has been updated. Refresh this page to continue with your saved workspace."); e.status=409; throw e; }
      const jobId = new URL(req.url).searchParams.get("jobId");
      if (jobId) {
        const details=await transact(s=>{
          const job=s.jobs.find(j=>j.id===jobId); if(!job) { const e=new Error("Job missing."); e.status=404; throw e; }
          const a=s.applications.find(a=>a.jobId===jobId);
          return {job:{...job,match:analyze(job,s.profile,s.preferences)},application:a?{...a,blockers:autoBlockers(s,a)}:null,revision:s.revision};
        },{readOnly:true,jobIds:[jobId]});
        return Response.json(details,{headers:{"Cache-Control":"no-store"}});
      }
      const state = await transact(workspaceSummary,{readOnly:true});
      return Response.json(
        { state, setup: setupStatus(), account: identity },
        { headers: { "Cache-Control": "no-store" } },
      );
    });
  } catch (e) {
    return Response.json(
      { error: e.message, setup: setupStatus(), account: signedIn || null },
      {
        status: e.status || (e.message.includes("Sign in") ? 401 : 503),
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
export async function POST(req) {
  try {
    return await withRequestWorkspace(req, async (identity) => {
      if(req.headers.get("x-snagly-client")!=="2") { const e=new Error("Snagly has been updated. Refresh this page before saving changes."); e.status=409; throw e; }
      const raw = await req.text();
      if (raw.length > 100000) throw new Error("Request is too large.");
      const parsed = JSON.parse(raw),
        body = schema.parse(parsed);
      if (
        !identity.verified &&
        ["discover", "submit", "approve"].includes(body.action)
      )
        throw new Error(
          "Verify your email before job discovery or application approval.",
        );
      if (body.action === "ai-tailor")
        await tailorWithAI(body.id, { revision: parsed.revision });
      else if (body.action === "submit")
        await sendApproved(body.id, { revision: parsed.revision });
      else if (body.action === "discover")
        await runDiscovery({ revision: parsed.revision });
      else
        await transact(async (s) => {
          if (parsed.revision !== s.revision)
            throw new Error("Workspace changed. Refresh and try again.");
          mutate(s, body);
        }, { jobIds: ["prepare","job"].includes(body.action) ? [body.id] : [],
          applicationIds: body.id && !["prepare","job","toggle-source","followed-up"].includes(body.action) ? [body.id] : [],
          newSkills: body.action === "profile" ? body.profile.skills : undefined });
      if (
        ["profile", "source-url"].includes(body.action) &&
        identity.verified
      ) {
        try {
          await runDiscovery();
        } catch {
          /* Source errors remain visible and hourly refresh can retry. */
        }
      }
      if (body.action === "prepare") {
        const enabled = await transact((s) => !!s.ai?.enabled, {
          readOnly: true,
        });
        if (enabled) await tailorWithAI(body.id);
      }
      return Response.json({ ok: true });
    });
  } catch (e) {
    const message =
      e.name === "ZodError"
        ? "Please check the form fields and required confirmations."
        : e.message;
    return Response.json({ error: message }, { status: e.status || 400 });
  }
}
