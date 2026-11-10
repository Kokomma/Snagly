import { withRequestWorkspace } from "../../../../lib/auth.mjs";
import { authorizedMailbox } from "../../../../lib/mailbox.mjs";
import { transact, setupStatus } from "../../../../lib/store.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req) {
  try {
    return await withRequestWorkspace(
      req,
      async () => {
        let mailbox;
        for (const provider of ["gmail", "outlook"]) {
          if (!setupStatus().emailProviders[provider]) continue;
          try {
            mailbox = await authorizedMailbox(provider);
            break;
          } catch {}
        }
        if (!mailbox)
          throw new Error(
            "Email authorization was not completed. Return to Settings to reconnect.",
          );
        await transact((s) => {
          s.emailConnection = {
            provider: mailbox.provider,
            email: mailbox.email,
            connectedAt: new Date().toISOString(),
          };
          s.preferences.submissionsEnabled = false;
          s.preferences.mode = "review";
          for (const a of s.applications) {
            a.approval = null;
            if (a.status === "approved") a.status = "draft";
          }
        });
        return Response.redirect(
          new URL("/", process.env.APP_ORIGIN || req.url),
          303,
        );
      },
      { verified: true, memberOnly: true },
    );
  } catch {
    return Response.json(
      {
        error:
          "Email connection could not be confirmed. Sign in and reconnect from Settings.",
      },
      { status: 400 },
    );
  }
}
