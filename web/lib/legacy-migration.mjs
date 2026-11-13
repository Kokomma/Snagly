import { firestore, setupStatus } from "./store.mjs";
import { pack, unpack } from "./packing.mjs";
import { initialState, now, event } from "./model.mjs";
import { workspaceDocument, validateUid } from "./workspace-context.mjs";
import { readNormalized } from "./normalized-store.mjs";
export function migratedState(old, identity) {
  const s = structuredClone(old);
  s.profile.name ||= identity.name || "";
  s.profile.email ||= identity.email || "";
  s.preferences.submissionsEnabled = false;
  s.preferences.mode = "review";
  for (const a of s.applications) {
    a.approval = null;
    if (a.status === "approved") a.status = "draft";
  }
  s.revision++;
  event(
    s,
    "account",
    "Existing personal workspace linked to this registered account. Earlier submission permissions cleared.",
  );
  return s;
}
export function hasPersonalWork(s) {
  return !!(
    s.profile.careerHistory ||
    s.profile.skills ||
    s.profile.country ||
    s.profile.cities ||
    s.profile.passions ||
    s.profile.applicationDetails ||
    s.profile.authorizedCountries ||
    s.profile.categories?.length ||
    JSON.stringify(s.preferences) !==
      JSON.stringify(initialState().preferences) ||
    s.jobs.length ||
    s.applications.length ||
    s.sources.length
  );
}
export async function claimLegacyWorkspace(identity) {
  if (identity.legacy)
    throw new Error(
      "Register or sign in with your email before linking the existing workspace.",
    );
  validateUid(identity.uid);
  if (!setupStatus().database)
    throw new Error(
      "Workspace linking requires the configured cloud database.",
    );
  const db = firestore(),
    claim = db.doc("snaglySystem/legacyClaim"),
    old = db.doc("snaglyOwner/workspace"),
    target = db.doc(workspaceDocument(identity));
  return db.runTransaction(async (tx) => {
    const [claimed, legacy, current] = await tx.getAll(claim, old, target);
    if (claimed.exists) {
      if (claimed.data().uid === identity.uid) return { alreadyLinked: true };
      throw new Error(
        "The existing owner workspace has already been linked to another account.",
      );
    }
    const read = async (root, meta) => {
      if (meta.data()?.storageFormat === 2) return (await readNormalized(db,tx,root,meta,{hydrateAll:true})).state;
      const n = meta.exists ? meta.data().chunks || 0 : 0;
      const refs = Array.from({ length: n }, (_, i) =>
        root.collection("chunks").doc(String(i).padStart(3, "0")),
      );
      const docs = refs.length ? await tx.getAll(...refs) : [];
      if (docs.some((d) => !d.exists))
        throw new Error("Workspace backup is incomplete.");
      return n ? unpack(docs.map((d) => d.data().packed)) : initialState();
    };
    const oldState = await read(old, legacy),
      newState = await read(target, current);
    if (oldState.applications.some((a) => a.status === "sending"))
      throw new Error(
        "An application is being submitted. Wait for that submission to finish before linking this workspace.",
      );
    if (hasPersonalWork(newState))
      throw new Error(
        "This account already has saved career data. Linking was stopped to avoid overwriting your work. Use a fresh account or request a careful merge.",
      );
    const s = migratedState(oldState, identity),
      chunks = pack(s);
    chunks.forEach((packed, i) =>
      tx.set(target.collection("chunks").doc(String(i).padStart(3, "0")), {
        packed,
      }),
    );
    const oldCount = current.exists ? current.data().chunks || 0 : 0;
    for (let i = chunks.length; i < oldCount; i++)
      tx.delete(target.collection("chunks").doc(String(i).padStart(3, "0")));
    tx.set(
      target,
      {
        uid: identity.uid,
        email: identity.email,
        name: identity.name || "",
        emailVerified: !!identity.verified,
        chunks: chunks.length,
        revision: s.revision,
        encoding: "gzip-json-v1",
        storageFormat: 1,
        updatedAt: now(),
      },
      { merge: true },
    );
    tx.set(claim, { uid: identity.uid, at: now() });
    return { linked: true };
  });
}
