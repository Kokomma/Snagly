import { equal, token, sameOrigin } from "../../../lib/auth.mjs";
import {
  setupStatus,
  legacyClaim,
  registerAccount,
} from "../../../lib/store.mjs";
import {
  authApi,
  emailPasswordLogin,
  newSession,
  accountIdentityFromCookie,
  cookieHeader,
  sendVerification,
} from "../../../lib/account-auth.mjs";
import { z } from "zod";
export const runtime = "nodejs";
export async function POST(req) {
  if (!sameOrigin(req))
    return Response.json(
      { error: "Request origin rejected." },
      { status: 403 },
    );
  if (!setupStatus().auth)
    return Response.json(
      {
        error: "Sign-in is temporarily unavailable. Please try again shortly.",
      },
      { status: 503 },
    );
  if (Number(req.headers.get("content-length") || 0) > 4096)
    return new Response(null, { status: 413 });
  let input;
  try {
    const raw = await req.text();
    if (raw.length > 4096) throw new Error("Too large");
    input = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  const operation = input.operation || "legacy";
  if (operation !== "legacy") {
    try {
      const email = z.email().max(254).parse(input.email).trim();
      if (operation === "reset") {
        try {
          await authApi("sendOobCode", {
            requestType: "PASSWORD_RESET",
            email,
            continueUrl:
              process.env.APP_ORIGIN || "https://snagly-personal.vercel.app",
          });
        } catch (e) {
          if (!["EMAIL_NOT_FOUND", "INVALID_EMAIL"].includes(e.authCode))
            throw e;
        }
        return Response.json(
          {
            ok: true,
            message:
              "If an account uses this email, a password reset link has been sent.",
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      const password = z.string().min(8).max(128).parse(input.password);
      let result;
      if (operation === "register") {
        const name = z.string().trim().min(1).max(100).parse(input.name);
        result = await authApi("signUp", {
          email,
          password,
          returnSecureToken: true,
        });
        await authApi("update", {
          idToken: result.idToken,
          displayName: name,
          returnSecureToken: true,
        });
      } else if (operation === "signin")
        result = await emailPasswordLogin(email, password);
      else throw new Error("Unsupported sign-in request.");
      const session = await newSession(result.idToken),
        identity = await accountIdentityFromCookie(session);
      if (operation === "register") await registerAccount(identity);
      let verificationSent = false;
      if (!identity.verified) {
        try {
          await sendVerification(result.idToken);
          verificationSent = true;
        } catch {
          /* The account still works; email delivery can be retried from its account panel. */
        }
      }
      const headers = new Headers({ "Cache-Control": "no-store" });
      headers.append("Set-Cookie", cookieHeader("snagly_account", session));
      headers.append("Set-Cookie", cookieHeader("snagly_session", "", 0));
      return Response.json(
        { ok: true, account: identity, verificationSent },
        { headers },
      );
    } catch (e) {
      return Response.json(
        {
          error:
            e.name === "ZodError"
              ? "Enter a valid email, your name and a password with at least 8 characters."
              : e.message,
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
  }
  if (
    !process.env.OWNER_PASSWORD ||
    !equal(input.password || "", process.env.OWNER_PASSWORD)
  ) {
    await new Promise((r) => setTimeout(r, 750));
    return Response.json({ error: "Incorrect password." }, { status: 401 });
  }
  if (await legacyClaim())
    return Response.json(
      {
        error:
          "Your existing workspace is linked to your registered account. Sign in with that account’s email and password.",
      },
      { status: 409 },
    );
  const legacyHeaders = new Headers({ "Cache-Control": "no-store" });
  legacyHeaders.append("Set-Cookie", cookieHeader("snagly_session", token()));
  legacyHeaders.append("Set-Cookie", cookieHeader("snagly_account", "", 0));
  return Response.json(
    { ok: true },
    {
      headers: legacyHeaders,
    },
  );
}
export async function DELETE(req) {
  if (!sameOrigin(req)) return new Response(null, { status: 403 });
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", cookieHeader("snagly_session", "", 0));
  headers.append("Set-Cookie", cookieHeader("snagly_account", "", 0));
  return Response.json({ ok: true }, { headers });
}
