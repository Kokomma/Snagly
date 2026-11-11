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
          } catch (e) {
            console.warn("Mailbox callback provider check failed", {
              provider,
              code: String(e.code || e.name || "unknown").slice(0, 80),
              status: Number(e.status) || null,
            });
          }
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
  } catch (e) {
    const signedOut = e.status === 401;
    return new Response(
      `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect your email · Snagly</title><body style="font:18px system-ui;background:#f7f6f2;color:#143a30;padding:8vw;max-width:650px"><h1>${signedOut ? "Sign in to finish connecting" : "Email connection needs another try"}</h1><p>${signedOut ? "Your Snagly session was unavailable when you returned from Microsoft. Sign in again, then start a fresh Outlook connection from Sources & settings." : "We could not confirm your mailbox. Return to Snagly and start a fresh connection from Sources & settings. Do not refresh or reuse the previous authorization page."}</p><p>Sending remains off.</p><a href="/">Return to Snagly</a></body></html>`,
      { status: signedOut ? 401 : 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" } },
    );
  }
}
