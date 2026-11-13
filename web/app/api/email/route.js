import { withRequestWorkspace } from "../../../lib/auth.mjs";
import { transact } from "../../../lib/store.mjs";
import { connectMailbox, disconnectMailbox } from "../../../lib/mailbox.mjs";
export const runtime = "nodejs";
export async function POST(req) {
  try {
    return await withRequestWorkspace(
      req,
      async () => {
        const raw = await req.text();
        if (raw.length > 1000) throw new Error("Request too large.");
        const { action, provider } = JSON.parse(raw);
        if (!["gmail", "outlook"].includes(provider))
          throw new Error("Choose Gmail or Outlook.");
        if (action === "connect")
          return Response.json({ url: await connectMailbox(provider) });
        if (action !== "disconnect") throw new Error("Unsupported action.");
        await transact((s) => {
          s.preferences.submissionsEnabled = false;
          s.preferences.mode = "review";
          s.emailConnection = null;
          for (const a of s.applications) {
            a.approval = null;
            if (a.status === "approved") a.status = "draft";
          }
        });
        try {
          await disconnectMailbox(provider);
        } catch {
          throw new Error(
            "Sending is paused. Provider revocation could not be confirmed; revoke Snagly in your email account settings too.",
          );
        }
        return Response.json({ ok: true });
      },
      { verified: true, memberOnly: true },
    );
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 400 });
  }
}
