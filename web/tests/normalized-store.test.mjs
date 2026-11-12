import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initialState, packageHash, analyze } from "../lib/model.mjs";
import { normalizedPlan, migrateNormalized, readNormalized, writeNormalized } from "../lib/normalized-store.mjs";
import { workspaceSummary, jobPage } from "../lib/workspace-view.mjs";
import { pack, unpack } from "../lib/packing.mjs";
import { reserveStorageBudget } from "../lib/storage-budget.mjs";
class MemoryDB {
  data=new Map(); reads=[]; writes=[];
  doc(path) { const db=this; return {path,collection:name=>({doc:id=>db.doc(`${path}/${name}/${id}`)}),get:()=>db.getAll(db.doc(path)).then(x=>x[0])}; }
  snap(ref) { const value=this.data.get(ref.path); return {exists:this.data.has(ref.path),data:()=>value}; }
  async getAll(...refs) {this.reads.push(...refs.map(r=>r.path)); return refs.map(r=>this.snap(r));}
  batch() {const changes=[]; return {set:(ref,data)=>changes.push([ref,data]),commit:async()=>{for(const [ref,data] of changes){this.data.set(ref.path,data);this.writes.push(ref.path);}}};}
  async runTransaction(fn) {const changes=[]; const value=await fn({get:async r=>(await this.getAll(r))[0],getAll:(...r)=>this.getAll(...r),set:(ref,data,options)=>changes.push([ref,data,options])});for(const [r,d,o] of changes){this.data.set(r.path,o?.merge?{...this.data.get(r.path),...d}:d);this.writes.push(r.path);}return value;}
}
function fixture() {
  const s=initialState();s.profile={...s.profile,name:"QA",email:"qa@example.invalid",skills:"SQL, Excel",careerHistory:"SQL reporting and Excel analysis"};
  s.jobs=Array.from({length:140},(_,i)=>({id:`lever:example:${i}`,sourceId:"src",title:`Analyst ${i}`,company:"Example",description:`SQL reporting, Excel analysis ${i}. `+"Career details and responsibilities. ".repeat(100),arrangement:"remote",countries:["Worldwide"],country:"",city:"",location:"Worldwide",url:`https://jobs.lever.co/example/${i}`,category:"Data & Analytics",discoveredAt:new Date().toISOString(),closed:false}));
  s.applications=[{id:"app",jobId:s.jobs[0].id,resume:"Exact submitted CV",letter:"Exact saved cover letter",status:"submitted",subject:"Role",recipient:"recruiting@example.invalid",submittedAt:new Date().toISOString(),approval:null,ai:{evidence:["saved evidence"]}}];
  return s;
}
async function migrated(s=fixture()) {
  const db=new MemoryDB(),root=db.doc(`snaglyUsers/${randomUUID()}`),chunks=pack(s);
  db.data.set(root.path,{chunks:chunks.length,revision:s.revision});chunks.forEach((packed,i)=>db.data.set(`${root.path}/chunks/${String(i).padStart(3,"0")}`,{packed}));
  const result=await migrateNormalized(db,root,{uid:"fixture",name:"QA"});
  return {db,root,result};
}
test("migration retains original chunks and CV packages; summaries never read full descriptions",async()=>{
  const original=fixture(),{db,root}=await migrated(original);
  assert.deepEqual(unpack([db.data.get(root.path+"/chunks/000").packed]),original);
  assert.equal(db.data.get(root.path).storageFormat,2);
  db.reads=[];
  const light=await db.runTransaction(tx=>readNormalized(db,tx,root,db.snap(root)));
  assert.equal(light.state.jobs.length,140);assert.equal(light.state.jobs[0].description,undefined);
  assert.equal(light.state.applications[0].resume,undefined);
  assert.ok(!db.reads.some(p=>/Bodies\//.test(p)));
  const full=await db.runTransaction(tx=>readNormalized(db,tx,root,db.snap(root),{jobIds:[original.jobs[0].id]}));
  assert.equal(full.state.applications[0].resume,original.applications[0].resume);
  assert.equal(full.state.applications[0].letter,original.applications[0].letter);
  assert.equal(packageHash(light.state.applications[0]),packageHash(full.state.applications[0]));
  assert.ok(db.reads.filter(p=>/Bodies\//.test(p)).length<=2);
  assert.deepEqual(analyze(light.state.jobs.find(j=>j.id===original.jobs[0].id),light.state.profile,light.state.preferences).matched,["SQL","Excel"]);
});
test("saving preferences changes a small section, not the job bodies or saved CVs",async()=>{
  const {db,root}=await migrated();db.writes=[];
  await db.runTransaction(async tx=>{const meta=db.snap(root),{state,base}=await readNormalized(db,tx,root,meta);state.preferences.dailyLimit=3;state.revision++;writeNormalized(db,tx,base,root,meta,state);});
  assert.deepEqual(db.writes.filter(p=>p!==root.path).map(p=>p.split("/").slice(-2).join("/")),["sections/core"]);
});
test("pagination and dashboard responses omit full CVs and descriptions",()=>{
  const s=fixture(),summary=workspaceSummary(s);
  assert.ok(summary.jobs.length<=9);assert.equal(summary.jobStats.active,140);
  assert.equal(summary.jobs[0].description,undefined);assert.equal(summary.applications[0].resume,undefined);
  const first=jobPage(s,new URLSearchParams({page:"1",personalized:"false"})),second=jobPage(s,new URLSearchParams({page:"2",personalized:"false"}));
  assert.equal(first.jobs.length,60);assert.equal(second.jobs.length,60);assert.equal(first.total,140);
  assert.ok(!first.jobs.some(a=>second.jobs.some(b=>b.id===a.id)));
});
test("public descriptions share references but private imported descriptions remain scoped",()=>{
  const s=fixture();const p=normalizedPlan(s);assert.equal(p.bodies.find(b=>b.ref.kind==="public").ref.kind,"public");
  s.jobs[0].sourceId=null;assert.ok(normalizedPlan(s).bodies.some(b=>b.ref.kind==="job"));
});
test("migration refuses a concurrent workspace revision change before activating staged data",async()=>{
  const db=new MemoryDB(),root=db.doc(`snaglyUsers/${randomUUID()}`),s=fixture();db.data.set(root.path,{revision:0,chunks:1});db.data.set(root.path+"/chunks/000",{packed:pack(s)[0]});
  const original=db.runTransaction.bind(db);let n=0;db.runTransaction=async fn=>{n++;if(n===2)db.data.set(root.path,{...db.data.get(root.path),revision:1});return original(fn);};
  await assert.rejects(migrateNormalized(db,root,{uid:"fixture"}),/changed during storage/);
  assert.equal(db.data.get(root.path).storageFormat,undefined);assert.ok(db.data.has(root.path+"/chunks/000"));
});
test("background reservations stop before consuming allowance reserved for foreground work",async()=>{
  const db=new MemoryDB();assert.equal((await reserveStorageBudget(db,{reads:29500,writes:23000})).allowed,true);
  assert.equal((await reserveStorageBudget(db,{reads:1000,writes:2000})).allowed,false);
});
