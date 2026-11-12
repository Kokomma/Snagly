import {
  getApps,
  initializeApp,
  cert,
  applicationDefault,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { initialState, now } from "./model.mjs";
import {
  workspaceIdentity,
  workspaceDocument,
  validateUid,
} from "./workspace-context.mjs";
import path from "node:path";
import { databaseError, firestoreClientConfig } from "./database-status.mjs";
import { readNormalized, writeNormalized, migrateNormalized, stageBodies } from "./normalized-store.mjs";
import { reserveStorageBudget } from "./storage-budget.mjs";
const accountRegistrations = new Map();
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
  db.settings({ preferRest: false, clientConfig: firestoreClientConfig });
  return db;
}
export async function transact(fn, { readOnly = false, ...scope } = {}) {
  const identity = workspaceIdentity();
  if (setupStatus().database) {
    const database = firestore(),
      root = database.doc(workspaceDocument(identity));
    const staged=new Set();
    const run = () => database.runTransaction(
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
        const meta = await tx.get(root);
        if (meta.data()?.storageFormat !== 2) {
          const e = new Error("Workspace storage upgrade required."); e.code = "storage_migration"; throw e;
        }
        const {state,base} = await readNormalized(database,tx,root,meta,scope);
        const result = await fn(state);
        if (!readOnly) {
          state.revision++;
          writeNormalized(database,tx,base,root,meta,state,staged);
        }
        return result;
      },
      readOnly ? { readOnly: true } : { maxAttempts: 3 },
    );
    const execute=async()=>{
      for(let attempt=0;attempt<3;attempt++) try { return await run(); } catch(e) {
        if(e.code==="storage_migration") {
          if(process.env.STORAGE_V2_MIGRATIONS_ENABLED!=="true") throw new Error("Snagly is upgrading workspace storage. Your data is preserved; please try again shortly.");
          await migrateNormalized(database,root,identity);
        }
        else if(e.code==="storage_stage") { await stageBodies(database,e.base,e.bodies); for(const b of e.bodies) staged.add(b.ref.kind+":"+b.ref.key); }
        else throw e;
      }
      throw new Error("Workspace changed during its storage upgrade. Refresh to retry.");
    };
    return execute().catch(e => { throw databaseError(e); });
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
  const registration = JSON.stringify([identity.email, identity.name, identity.verified]);
  const cached = accountRegistrations.get(identity.uid);
  if (cached?.registration === registration && cached.expires > Date.now()) return;
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
  if (accountRegistrations.size >= 1000) accountRegistrations.clear();
  accountRegistrations.set(identity.uid, { registration, expires: Date.now() + 900000 });
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
export async function reserveHourlyStorage() {
  if(!setupStatus().database) return {allowed:true};
  return reserveStorageBudget(firestore(),{reads:300,writes:600,kind:"hourly-discovery"});
}
