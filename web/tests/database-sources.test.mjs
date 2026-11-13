import test from "node:test";
import assert from "node:assert/strict";
import { databaseError, firestoreClientConfig } from "../lib/database-status.mjs";
import { boardFromUrl } from "../lib/board-links.mjs";
import { readSmartRecruiters } from "../lib/extra-adapters.mjs";
import { apiResponse } from "../lib/api-response.mjs";
test("plain-text hosting failures produce a readable message instead of a JSON parsing error", async () => {
  await assert.rejects(apiResponse(new Response("An error occurred",{status:504})), /server could not complete/);
  assert.deepEqual(await apiResponse(Response.json({error:"Database allowance exhausted"},{status:503})),{error:"Database allowance exhausted"});
});
test("database quota has a recoverable message and RPC retries do not repeat exhausted quota", () => {
  const error = databaseError(Object.assign(new Error("Quota exceeded"), {code:8}));
  assert.equal(error.status,503);
  assert.equal(error.code,"database_quota");
  assert.match(error.message,/saved data has not been deleted/);
  assert.equal(firestoreClientConfig.interfaces["google.firestore.v1.Firestore"].methods.BatchGetDocuments.retry_codes_name,"non_idempotent");
});
test("public job board URLs save generically while private hosts and credentials remain rejected", () => {
  for (const link of ["https://jobs.smartrecruiters.com", "https://jobs.example.com/search?role=analyst", "https://www.indeed.com/jobs?q=finance"])
    assert.equal(boardFromUrl(link).type,"research");
  for (const link of ["https://localhost/jobs","https://127.0.0.1/jobs","https://[::1]/jobs","https://work.internal/jobs","https://secret@example.com/jobs"])
    assert.throws(()=>boardFromUrl(link));
  assert.equal(boardFromUrl("https://jobs.smartrecruiters.com/Example/123-analyst").board,"Example");
});
test("SmartRecruiters imports only public company postings and preserves partial-feed information", async () => {
  const source={id:"s",board:"Example",company:"Example"};
  const jobs=await readSmartRecruiters(source,async url=> {
    assert.ok(url.startsWith("https://api.smartrecruiters.com/v1/companies/Example/postings"));
    if(url.includes("?")) { assert.ok(url.includes("destination=PUBLIC")); return Response.json({totalFound:101,content:[{id:"123",name:"Analyst"}]}); }
    return Response.json({name:"Analyst",company:{name:"Example"},location:{city:"Lagos",country:"ng",remote:true},jobAd:{sections:{jobDescription:{text:"Financial SQL reporting"}}},applyUrl:"https://jobs.smartrecruiters.com/Example/123"});
  });
  assert.equal(jobs[0].country,"Nigeria"); assert.equal(jobs[0].arrangement,"remote");
  assert.match(jobs[0].description,/SQL/); assert.equal(source.partial,true);
});
