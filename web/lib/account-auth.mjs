import { getAuth } from "firebase-admin/auth";
import { firebaseApp } from "./store.mjs";
const messages = {
  TOO_MANY_ATTEMPTS_TRY_LATER: "Too many attempts. Please wait and try again.",
  WEAK_PASSWORD: "Choose a password with at least 8 characters.",
  OPERATION_NOT_ALLOWED: "Email/password sign-in is not enabled yet.",
};
export function accountAuth() {
  return getAuth(firebaseApp());
}
export async function authApi(method, body, fetcher = fetch) {
  if (!process.env.FIREBASE_WEB_API_KEY)
    throw new Error(
      "Account registration is being configured. Please try again shortly.",
    );
  const r = await fetcher(
    `https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${encodeURIComponent(process.env.FIREBASE_WEB_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
      redirect: "error",
    },
  );
  const data = await r.json();
  if (!r.ok) {
    const code = String(data.error?.message || "").split(" : ")[0];
    const e = new Error(
      messages[code] ||
        "Unable to complete that request. Check your details, sign in, or reset your password.",
    );
    e.authCode = code;
    throw e;
  }
  return data;
}
export async function emailPasswordLogin(email, password) {
  return authApi("signInWithPassword", {
    email,
    password,
    returnSecureToken: true,
  });
}
export async function accountIdentityFromCookie(
  cookie,
  verify = (token) => accountAuth().verifySessionCookie(token, true),
  lookup = (uid) => accountAuth().getUser(uid),
) {
  const decoded = await verify(cookie);
  const user = await lookup(decoded.uid);
  if (user.disabled) throw new Error("Sign in to your private workspace.");
  return {
    uid: decoded.uid,
    legacy: false,
    email: user.email || decoded.email || "",
    name: user.displayName || "",
    verified: !!user.emailVerified,
  };
}
export async function newSession(idToken) {
  const decoded = await accountAuth().verifyIdToken(idToken);
  if (Date.now() / 1000 - decoded.auth_time > 300)
    throw new Error("Please sign in again to start a fresh session.");
  return accountAuth().createSessionCookie(idToken, {
    expiresIn: 7 * 86400000,
  });
}
export function cookieHeader(name, value, maxAge = 604800) {
  // OAuth returns through a top-level cross-site GET. Mutations still require
  // sameOrigin in withRequestWorkspace; the session remains inaccessible to JS.
  const sameSite = name === "snagly_account" ? "Lax" : "Strict";
  return `${name}=${value}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export async function sendVerification(idToken) {
  return authApi("sendOobCode", {
    requestType: "VERIFY_EMAIL",
    idToken,
    continueUrl: process.env.APP_ORIGIN || "https://snagly-personal.vercel.app",
  });
}
