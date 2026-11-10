import { createHmac, timingSafeEqual } from "node:crypto";
import { setupStatus } from "./store.mjs";
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
  if (!setupStatus().auth) return false;
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
