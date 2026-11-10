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
let db,
  queue = Promise.resolve();
export function setupStatus() {
  return {
    auth:
      !!process.env.OWNER_PASSWORD &&
      process.env.OWNER_PASSWORD.length >= 16 &&
      !!process.env.SESSION_SECRET &&
      process.env.SESSION_SECRET.length >= 32,
    database:
      !!process.env.FIREBASE_PROJECT_ID &&
      (!!process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
        !!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        !!process.env.FIRESTORE_EMULATOR_HOST),
    local: !process.env.VERCEL,
    cron: !!process.env.CRON_SECRET,
    email:
      process.env.ENABLE_SUBMISSIONS === "true" &&
      !!process.env.RESEND_API_KEY &&
      !!process.env.APPLICATION_FROM,
  };
}
function firestore() {
  if (db) return db;
  const credentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
    : applicationDefault();
  const app =
    getApps().find((a) => a.name === "snagly") ||
    initializeApp(
      { credential: credentials, projectId: process.env.FIREBASE_PROJECT_ID },
      "snagly",
    );
  db = getFirestore(app, process.env.FIRESTORE_DATABASE_ID || "snagly");
  db.settings({ preferRest: true });
  return db;
}
export async function transact(fn, { readOnly = false } = {}) {
  if (setupStatus().database) {
    const database = firestore(),
      root = database.doc("snaglyOwner/workspace");
    return database.runTransaction(
      async (tx) => {
        const meta = await tx.get(root),
          count = meta.exists ? meta.data().chunks : 0;
        const refs = Array.from({ length: count }, (_, i) =>
          root.collection("chunks").doc(String(i).padStart(3, "0")),
        );
        const docs = refs.length ? await tx.getAll(...refs) : [];
        if (docs.some((d) => !d.exists))
          throw new Error(
            "Workspace snapshot is incomplete. Restore a verified backup.",
          );
        const state = meta.exists
          ? unpack(docs.map((d) => d.data().packed))
          : initialState();
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
          tx.set(root, {
            revision: state.revision,
            chunks: chunks.length,
            encoding: "gzip-json-v1",
            updatedAt: now(),
          });
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
    await mkdir(".data", { recursive: true });
    let state;
    try {
      state = JSON.parse(await readFile(".data/state.json", "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      state = initialState();
    }
    const result = await fn(state);
    if (!readOnly) {
      state.revision++;
      await writeFile(".data/state.tmp", JSON.stringify(state), "utf8");
      await rename(".data/state.tmp", ".data/state.json");
    }
    return result;
  });
  queue = task.catch(() => {});
  return task;
}
