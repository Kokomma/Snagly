import { createHash, randomUUID } from "node:crypto";
import { pack, unpack } from "./packing.mjs";
import { initialState, analyze, packageHash, now } from "./model.mjs";
import { reserveStorageBudget } from "./storage-budget.mjs";
const hash = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const SHARDS = 8;
const appBodyKeys = ["resume", "letter", "ai", "method"];
const caches = new Map();
const encoded = value => { const chunks = pack(value); if (chunks.length !== 1) throw new Error("A workspace section needs further splitting. The existing data is preserved."); return {packed:chunks[0]}; };
const decoded = doc => { if (!doc.exists) throw new Error("A workspace record is missing; your original backup remains intact."); return unpack([doc.data().packed]); };
const shard = id => parseInt(hash(id).slice(0,8),16) % SHARDS;
const estimate = (data, unit) => Math.max(1,Math.ceil((data.packed ? data.packed.byteLength+128 : Buffer.byteLength(JSON.stringify(data)))/unit));
function cached(path, digest) { const item = caches.get(path); return item?.digest === digest && item.expires > Date.now() ? structuredClone(item.value) : null; }
function remember(path, digest, value) {
  if (caches.size >= 120) caches.delete(caches.keys().next().value);
  caches.set(path, { digest, value: structuredClone(value), expires: Date.now()+1800000 });
}
export function normalizedPlan(state, before = null, oldManifest = {}) {
  const records = [], manifest = {}, pending = [];
  const fresh = Object.keys(oldManifest).length === 0;
  const add = (path, value) => { const digest = hash(value); manifest[path] = digest;
    if (oldManifest[path] !== digest) records.push({ path, data: encoded(value) });
  };
  const groups = { jobs: Array.from({length:SHARDS},()=>[]), applications: Array.from({length:SHARDS},()=>[]) };
  for (const j of state.jobs) {
    const summary = {...j}; delete summary.match;
    if (typeof j.description === "string") {
      const publicJob = !!j.sourceId && /^(greenhouse|lever|ashby|workable|smartrecruiters|hiringcafe):/.test(j.id);
      const body = { description: j.description };
      const key = hash(publicJob ? j.description : `${j.id}:${j.description}`);
      const bodyRef = { kind: publicJob ? "public" : "job", key };
      if (fresh || j._body?.key !== key) pending.push({ ref: bodyRef, data: encoded(body) });
      summary._body = bodyRef;
      const matching = analyze(j, state.profile, state.preferences);
      summary._skillProfile = state.profile.skills || "";
      summary._skillMatches = matching.matched;
      summary._category = matching.category;
    }
    delete summary.description;
    groups.jobs[shard(j.id)].push(summary);
  }
  for (const a of state.applications) {
    const summary = {...a}; delete summary.blockers;
    if (typeof a.resume === "string" && typeof a.letter === "string") {
      const body = Object.fromEntries(appBodyKeys.filter(k=>a[k] !== undefined).map(k=>[k,a[k]]));
      const key = hash(`${a.id}:${JSON.stringify(body)}`);
      if (fresh || a._body?.key !== key) pending.push({ ref: {kind:"application",key}, data: encoded(body) });
      summary._body = {kind:"application",key};
      summary._packageHash = packageHash(a);
      summary._hasAI = !!a.ai;
    }
    for (const key of appBodyKeys) delete summary[key];
    groups.applications[shard(a.id)].push(summary);
  }
  const core = {...state};
  for (const key of ["profile","jobs","applications","activity","notifications","revision"]) delete core[key];
  add("sections/profile",state.profile); add("sections/core",core);
  add("sections/activity",state.activity); add("sections/notifications",state.notifications);
  for (const [name, buckets] of Object.entries(groups)) buckets.forEach((values,i)=>add(`indexes/${name}-${i}`,values));
  const uniqueBodies = [...new Map(pending.map(p=>[p.ref.kind+":"+p.ref.key,p])).values()];
  return { records, bodies: uniqueBodies, manifest,
    estimatedIndexReadUnits: records.reduce((n,r)=>n+estimate(r.data,4096),0),
    estimatedChangedWriteUnits: [...records,...uniqueBodies].reduce((n,r)=>n+estimate(r.data,1024),0),
  };
}
function bodyDoc(database, base, ref) {
  if (!ref || !/^[a-f0-9]{64}$/.test(ref.key) || !["public","job","application"].includes(ref.kind)) throw new Error("Invalid workspace body reference.");
  return ref.kind === "public" ? database.doc(`snaglyPublicJobBodies/${ref.key}`) : base.collection(ref.kind === "job" ? "jobBodies" : "applicationBodies").doc(ref.key);
}
export async function readNormalized(database, tx, root, meta, options={}) {
  const info = meta.data();
  if (!/^[a-f0-9-]{36}$/.test(info.storageGeneration || "")) throw new Error("Workspace storage generation is invalid.");
  const base = root.collection("storage").doc(info.storageGeneration);
  const state = initialState(); state.revision = info.revision || 0;
  const paths = Object.keys(info.manifest || {});
  if(paths.length!==SHARDS*2+4 || !paths.every(p=>/^(sections\/(profile|core|activity|notifications)|indexes\/(jobs|applications)-[0-7])$/.test(p))) throw new Error("Workspace record manifest is incomplete. Original backups remain preserved.");
  const values=new Map(paths.map(p=>[p,cached(`${base.path}/${p}`,info.manifest[p])]));
  const needed = paths.filter(p=>!values.get(p));
  const docs = needed.length ? await tx.getAll(...needed.map(p=>database.doc(`${base.path}/${p}`))) : [];
  needed.forEach((p,i)=>{const value=decoded(docs[i]);values.set(p,value);remember(`${base.path}/${p}`,info.manifest[p],value);});
  for (const p of paths) {
    const value = values.get(p);
    if (p === "sections/core") Object.assign(state,value);
    else if (p.startsWith("sections/")) state[p.split("/")[1]] = value;
    else if (p.startsWith("indexes/jobs-")) state.jobs.push(...value);
    else if (p.startsWith("indexes/applications-")) state.applications.push(...value);
  }
  const appIds = new Set(options.applicationIds || []), jobIds = new Set(options.jobIds || []);
  const apps = state.applications.filter(a=>options.hydrateAll || appIds.has(a.id) || jobIds.has(a.jobId));
  for (const a of apps) jobIds.add(a.jobId);
  const jobs = state.jobs.filter(j=>options.hydrateAll || options.hydrateAllJobs || (options.newSkills !== undefined && options.newSkills !== state.profile.skills) || jobIds.has(j.id));
  const targets = [...jobs,...apps].filter(x=>x._body);
  const bodyValues=new Map(targets.map(x=>{const p=bodyDoc(database,base,x._body).path;return [p,cached(p,x._body.key)];}));
  const missing = [...new Map(targets.filter(x=>!bodyValues.get(bodyDoc(database,base,x._body).path)).map(x=>[bodyDoc(database,base,x._body).path,x])).values()];
  const bodies = missing.length ? await tx.getAll(...missing.map(x=>bodyDoc(database,base,x._body))) : [];
  missing.forEach((x,i)=>{const value=decoded(bodies[i]),p=bodyDoc(database,base,x._body).path;bodyValues.set(p,value);remember(p,x._body.key,value);});
  for (const x of targets) Object.assign(x,bodyValues.get(bodyDoc(database,base,x._body).path));
  return {state,base,manifest:info.manifest};
}
export async function stageBodies(database,base,bodies) {
  if (bodies.reduce((n,b)=>n+estimate(b.data,1024),0)>22000) throw new Error("Discovery needs a smaller batch to stay within the free database allowance. Existing records remain intact.");
  for(let i=0;i<bodies.length;i+=100) { const batch=database.batch(); for(const b of bodies.slice(i,i+100)) batch.set(bodyDoc(database,base,b.ref),b.data); await batch.commit(); }
}
export function writeNormalized(database, tx, base, root, meta, state, staged = new Set()) {
  const plan = normalizedPlan(state,null,meta.data().manifest);
  const bodies=plan.bodies.filter(b=>!staged.has(b.ref.kind+":"+b.ref.key));
  if (plan.records.length + bodies.length > 350) {
    const e=new Error("Stage immutable posting bodies before committing their references."); e.code="storage_stage"; e.bodies=bodies; e.base=base; throw e;
  }
  for (const r of plan.records) tx.set(database.doc(`${base.path}/${r.path}`),r.data);
  for (const b of bodies) tx.set(bodyDoc(database,base,b.ref),b.data);
  tx.set(root,{revision:state.revision,manifest:plan.manifest,updatedAt:now(),lastWriteUnitsEstimate:plan.estimatedChangedWriteUnits},{merge:true});
  return plan;
}
// Stage immutable records first, then atomically switch the root pointer. Original chunks are retained.
export async function migrateNormalized(database, root, identity) {
  const original = await root.get();
  if (original.data()?.storageFormat === 2) return {alreadyMigrated:true};
  const count = original.data()?.chunks || 0;
  const docs = count ? await database.getAll(...Array.from({length:count},(_,i)=>root.collection("chunks").doc(String(i).padStart(3,"0")))) : [];
  const state = count ? unpack(docs.map(d=>{ if (!d.exists) throw new Error("Original workspace backup is incomplete."); return d.data().packed; })) : initialState();
  if (!count && !identity.legacy) { state.profile.name = identity.name || ""; state.profile.email = identity.email || ""; }
  const generation = randomUUID(), base = root.collection("storage").doc(generation);
  const plan = normalizedPlan(state);
  const staged = [...plan.records.map(r=>({ref:database.doc(`${base.path}/${r.path}`),data:r.data})),...plan.bodies.map(b=>({ref:bodyDoc(database,base,b.ref),data:b.data}))];
  // Refuse oversized one-day migrations rather than exhausting the shared free write allowance.
  if (plan.estimatedChangedWriteUnits > 22000) throw new Error("This workspace needs a staged migration across daily allowances. Your original data is preserved.");
  const reservation=await reserveStorageBudget(database,{reads:Math.max(100,count*160+plan.bodies.length+plan.estimatedIndexReadUnits+20),writes:plan.estimatedChangedWriteUnits+10,kind:"migration"});
  if(!reservation.allowed) throw new Error(reservation.reason);
  for (let i=0;i<staged.length;i+=100) { const batch=database.batch(); for (const r of staged.slice(i,i+100)) batch.set(r.ref,r.data); await batch.commit(); }
  const stagedMeta={data:()=>({storageGeneration:generation,manifest:plan.manifest,revision:state.revision})};
  const restored=await database.runTransaction(tx=>readNormalized(database,tx,root,stagedMeta,{hydrateAll:true}),{readOnly:true});
  if(stateDigest(state)!==stateDigest(restored.state)) throw new Error("Storage verification failed. Original workspace remains active and unchanged.");
  await database.runTransaction(async tx=>{
    const current=await tx.get(root);
    if (current.data()?.storageFormat === 2) return;
    if ((current.data()?.revision || 0) !== (original.data()?.revision || 0)) throw new Error("Workspace changed during storage upgrade. Refresh to retry safely.");
    tx.set(root,{ storageFormat:2,storageGeneration:generation,manifest:plan.manifest,revision:state.revision,
      legacyBackup:{chunks:count,revision:state.revision,digest:stateDigest(state),at:now()},migratedAt:now(),
      estimatedIndexReadUnits:plan.estimatedIndexReadUnits },{merge:true});
  },{maxAttempts:3});
  return {migrated:true,jobs:state.jobs.length,applications:state.applications.length,estimatedWriteUnits:plan.estimatedChangedWriteUnits};
}
export function stateDigest(state) {
  const internal=new Set(["_body","_skillProfile","_skillMatches","_packageHash","_hasAI","_category","match","blockers"]);
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).filter(k=>!internal.has(k)).sort().map(k=>[k,canonical(value[k])])):value;
  return hash(canonical({...state,jobs:[...state.jobs].sort((a,b)=>a.id.localeCompare(b.id)),applications:[...state.applications].sort((a,b)=>a.id.localeCompare(b.id))}));
}
