import {
  getApps,
  initializeApp,
  cert,
  applicationDefault,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { initialState, now } from "./model.mjs";
import { pack, unpack } from "./packing.mjs";
import {
  workspaceIdentity,
  workspaceDocument,
  validateUid,
} from "./workspace-context.mjs";
import path from "node:path";
let db,
  queue = Promise.resolve();
export function setupStatus() {
  return {
    auth:
      (!!process.env.FIREBASE_WEB_API_KEY &&
        !!process.env.FIREBASE_PROJECT_ID) ||
      (!!process.env.OWNER_PASSWORD &&
        process.env.OWNER_PASSWORD.length >= 16 &&
        !!process.env.SESSION_SECRET &&
        process.env.SESSION_SECRET.length >= 32),
    accounts:
      !!process.env.FIREBASE_WEB_API_KEY && !!process.env.FIREBASE_PROJECT_ID,
    legacy: !!process.env.OWNER_PASSWORD && !!process.env.SESSION_SECRET,
    database:
      !!process.env.FIREBASE_PROJECT_ID &&
      (!!process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
        !!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        !!process.env.FIRESTORE_EMULATOR_HOST),
    local: !process.env.VERCEL,
    cron: !!process.env.CRON_SECRET,
    ai:
      process.env.GOOGLE_FREE_TIER_CONFIRMED === "true" &&
      !!process.env.GOOGLE_GENERATIVE_AI_API_KEY &&
      !!process.env.AI_FREE_MODEL,
    emailProviders: {
      gmail: !!process.env.CONNECTOR_GMAIL,
      outlook: !!process.env.CONNECTOR_OUTLOOK,
    },
    email:
      process.env.ENABLE_SUBMISSIONS === "true" &&
      (!!process.env.CONNECTOR_GMAIL ||
        !!process.env.CONNECTOR_OUTLOOK ||
        (!!process.env.RESEND_API_KEY && !!process.env.APPLICATION_FROM)),
  };
}
export function firebaseApp() {
  const credentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
    : applicationDefault();
  return (
    getApps().find((a) => a.name === "snagly") ||
    initializeApp(
      { credential: credentials, projectId: process.env.FIREBASE_PROJECT_ID },
      "snagly",
    )
  );
}
export function firestore() {
  if (db) return db;
  const app = firebaseApp();
  db = getFirestore(app, process.env.FIRESTORE_DATABASE_ID || "snagly");
  db.settings({ preferRest: true });
  return db;
}
export async function transact(fn, { readOnly = false } = {}) {
  const identity = workspaceIdentity();
  if (setupStatus().database) {
    const database = firestore(),
      root = database.doc(workspaceDocument(identity));
    return database.runTransaction(
      async (tx) => {
        if (identity.legacy) {
          const claimed = await tx.get(
            database.doc("snaglySystem/legacyClaim"),
          );
          if (claimed.exists)
            throw new Error(
              "Your workspace is linked to your registered account. Please sign in with your email.",
            );
        }
        const meta = await tx.get(root),
          count = meta.exists ? meta.data().chunks || 0 : 0;
        const refs = Array.from({ length: count }, (_, i) =>
          root.collection("chunks").doc(String(i).padStart(3, "0")),
        );
        const docs = refs.length ? await tx.getAll(...refs) : [];
        if (docs.some((d) => !d.exists))
          throw new Error(
            "Workspace snapshot is incomplete. Restore a verified backup.",
          );
        const state = count
          ? unpack(docs.map((d) => d.data().packed))
          : initialState();
        if (!count && !identity.legacy) {
          state.profile.name = identity.name || "";
          state.profile.email = identity.email || "";
        }
        const result = await fn(state);
        if (!readOnly) {
          state.revision++;
          const chunks = pack(state);
          chunks.forEach((packed, i) =>
            tx.set(root.collection("chunks").doc(String(i).padStart(3, "0")), {
              packed,
            }),
          );
          for (let i = chunks.length; i < count; i++) tx.delete(refs[i]);
          tx.set(
            root,
            {
              revision: state.revision,
              chunks: chunks.length,
              encoding: "gzip-json-v1",
              updatedAt: now(),
            },
            { merge: true },
          );
        }
        return result;
      },
      { maxAttempts: 5, readOnly },
    );
  }
  if (process.env.VERCEL)
    throw new Error(
      "Configure the Firebase server connection before saving personal data on Vercel.",
    );
  const task = queue.then(async () => {
    const directory = process.env.SNAGLY_DATA_DIRECTORY || ".data";
    await mkdir(path.join(directory, "users"), { recursive: true });
    const file = identity.legacy
      ? path.join(directory, "state.json")
      : path.join(directory, "users", `${validateUid(identity.uid)}.json`);
    let state;
    try {
      state = JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      state = initialState();
      if (!identity.legacy) {
        state.profile.name = identity.name || "";
        state.profile.email = identity.email || "";
      }
    }
    const result = await fn(state);
    if (!readOnly) {
      state.revision++;
      await writeFile(file + ".tmp", JSON.stringify(state), "utf8");
      await rename(file + ".tmp", file);
    }
    return result;
  });
  queue = task.catch(() => {});
  return task;
}
export async function registerAccount(identity) {
  if (identity.legacy) return;
  validateUid(identity.uid);
  if (setupStatus().database)
    await firestore()
      .doc(workspaceDocument(identity))
      .set(
        {
          uid: identity.uid,
          email: identity.email || "",
          name: identity.name || "",
          emailVerified: !!identity.verified,
          disabled: false,
          lastSeenAt: now(),
        },
        { merge: true },
      );
}
export async function legacyClaim() {
  if (!setupStatus().database) return null;
  const doc = await firestore().doc("snaglySystem/legacyClaim").get();
  return doc.exists ? doc.data() : null;
}
export async function scheduledAccounts() {
  if (!setupStatus().database)
    return [{ uid: "legacy-owner", legacy: true, verified: true }];
  const refs = await firestore().collection("snaglyUsers").listDocuments();
  const docs = refs.length
    ? await firestore().getAll(...refs, {
        fieldMask: ["uid", "emailVerified", "disabled"],
      })
    : [];
  const identities = docs
    .filter((d) => d.exists && d.data().emailVerified && !d.data().disabled)
    .map((d) => ({ uid: d.id, legacy: false, verified: true }));
  if (!(await legacyClaim()))
    identities.push({ uid: "legacy-owner", legacy: true, verified: true });
  return identities;
}
