import { withRequestWorkspace } from "../../../lib/auth.mjs";
import { transact } from "../../../lib/store.mjs";
import { jobPage } from "../../../lib/workspace-view.mjs";
export const runtime="nodejs";
export async function GET(req) {
  try { return await withRequestWorkspace(req,async()=>Response.json(await transact(s=>jobPage(s,new URL(req.url).searchParams),{readOnly:true}),{headers:{"Cache-Control":"no-store"}})); }
  catch(e) { return Response.json({error:e.message},{status:e.status||503}); }
}
