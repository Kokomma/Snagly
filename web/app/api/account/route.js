import { withRequestWorkspace, equal } from "../../../lib/auth.mjs";
import { claimLegacyWorkspace } from "../../../lib/legacy-migration.mjs";
import {
  emailPasswordLogin,
  sendVerification,
} from "../../../lib/account-auth.mjs";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req) {
  try {
    return await withRequestWorkspace(req, async (account) =>
      Response.json({ account }, { headers: { "Cache-Control": "no-store" } }),
    );
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 400 });
  }
}
export async function POST(req) {
  try {
    return await withRequestWorkspace(
      req,
      async (identity) => {
        const raw = await req.text();
        if (raw.length > 4096) throw new Error("Request is too large.");
        const b = JSON.parse(raw);
        if (b.action === "claim-legacy") {
          if (
            !process.env.OWNER_PASSWORD ||
            !equal(
              z.string().max(300).parse(b.ownerPassword),
              process.env.OWNER_PASSWORD,
            )
          )
            throw new Error("The original owner password is incorrect.");
          const result = await claimLegacyWorkspace(identity);
          return Response.json({ ok: true, ...result });
        }
        if (b.action === "verify-email") {
          const result = await emailPasswordLogin(
            identity.email,
            z.string().min(8).max(128).parse(b.password),
          );
          await sendVerification(result.idToken);
          return Response.json({
            ok: true,
            message:
              "Verification email sent. Check your inbox and spam folder.",
          });
        }
        throw new Error("Unsupported account request.");
      },
      { memberOnly: true },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e.name === "ZodError"
            ? "Please check the required fields."
            : e.message,
      },
      { status: e.status || 400 },
    );
  }
}
