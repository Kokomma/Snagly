import { equal, token, sameOrigin } from "../../../lib/auth.mjs";
import { setupStatus } from "../../../lib/store.mjs";
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
        error:
          "Owner sign-in needs OWNER_PASSWORD (16+ characters) and SESSION_SECRET (32+ characters).",
      },
      { status: 503 },
    );
  if (Number(req.headers.get("content-length") || 0) > 4096)
    return new Response(null, { status: 413 });
  let password;
  try {
    ({ password } = await req.json());
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!equal(password || "", process.env.OWNER_PASSWORD)) {
    await new Promise((r) => setTimeout(r, 750));
    return Response.json({ error: "Incorrect password." }, { status: 401 });
  }
  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": `snagly_session=${token()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
        "Cache-Control": "no-store",
      },
    },
  );
}
export async function DELETE(req) {
  if (!sameOrigin(req)) return new Response(null, { status: 403 });
  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie":
          "snagly_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      },
    },
  );
}
