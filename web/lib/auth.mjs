import { createHmac, timingSafeEqual } from "node:crypto";
import { setupStatus, legacyClaim, registerAccount } from "./store.mjs";
import { accountIdentityFromCookie } from "./account-auth.mjs";
import { withWorkspace } from "./workspace-context.mjs";
const digest = (s) =>
  createHmac("sha256", process.env.SESSION_SECRET || "unconfigured")
    .update(String(s))
    .digest();
export function equal(a, b) {
  return timingSafeEqual(digest(a), digest(b));
}
export function token() {
  const expires = Date.now() + 1000 * 60 * 60 * 24 * 7;
  return `${expires}.${digest(`${expires}:${process.env.OWNER_PASSWORD}`).toString("hex")}`;
}
export function authenticated(request) {
  if (!process.env.OWNER_PASSWORD || !process.env.SESSION_SECRET) return false;
  const cookie =
    request.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("snagly_session="))
      ?.slice(15) || "";
  const [expires, signature] = cookie.split(".");
  return (
    /^\d+$/.test(expires || "") &&
    Number(expires) > Date.now() &&
    equal(
      signature || "",
      digest(`${expires}:${process.env.OWNER_PASSWORD}`).toString("hex"),
    )
  );
}
export function sameOrigin(request) {
  try {
    const origin = new URL(request.headers.get("origin"));
    const host = request.headers.get("host") || new URL(request.url).host;
    return (
      ["http:", "https:"].includes(origin.protocol) && origin.host === host
    );
  } catch {
    return false;
  }
}
export function requireOwner(request) {
  if (!authenticated(request))
    throw new Error("Sign in to your private workspace.");
  if (request.method !== "GET" && !sameOrigin(request))
    throw new Error("Request origin rejected.");
}
export function readCookie(request, name) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(name + "="))
      ?.slice(name.length + 1) || ""
  );
}
export async function requestIdentity(request) {
  const session = readCookie(request, "snagly_account");
  if (session) {
    try {
      return await accountIdentityFromCookie(session);
    } catch {
      const e = new Error("Sign in to your private workspace.");
      e.status = 401;
      throw e;
    }
  }
  if (authenticated(request) && !(await legacyClaim()))
    return { uid: "legacy-owner", legacy: true, verified: true };
  const e = new Error("Sign in to your private workspace.");
  e.status = 401;
  throw e;
}
export async function withRequestWorkspace(
  request,
  fn,
  { verified = false, memberOnly = false } = {},
) {
  if (request.method !== "GET" && !sameOrigin(request)) {
    const e = new Error("Request origin rejected.");
    e.status = 403;
    throw e;
  }
  const identity = await requestIdentity(request);
  if (memberOnly && identity.legacy)
    throw new Error("Create or sign in to an email account first.");
  if (verified && !identity.verified)
    throw new Error(
      "Verify your email before running job discovery or submitting applications.",
    );
  if (!identity.legacy && request.method !== "GET") await registerAccount(identity);
  return withWorkspace(identity, () => fn(identity));
}
