import test from "node:test";
import assert from "node:assert/strict";
import { documentPdf } from "../lib/pdf.mjs";
import { extractText, getDocumentProxy } from "unpdf";
import { mergeDuplicateJobs, vacancyKey } from "../lib/job-dedup.mjs";
import { applicationLink } from "../lib/application-link.mjs";
import { boardFromUrl } from "../lib/board-links.mjs";
import { readWorkable } from "../lib/extra-adapters.mjs";
test("PDF CVs preserve text, Unicode and multiple pages with valid cleanup", async () => {
  const text = "Zoë — Financial Analyst\nSQL reporting and financial analysis.\n".repeat(100);
  const bytes = await documentPdf(text);
  assert.equal(bytes.subarray(0,4).toString(), "%PDF");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    assert.ok(pdf.numPages > 1);
    const result = await extractText(pdf, { mergePages: true });
    assert.match(result.text, /Zoë/);
    assert.match(result.text, /SQL reporting/);
  } finally { await pdf.loadingTask.destroy(); }
});
test("cross-source identity ignores tracking but preserves different requisitions and saved packages", () => {
  const state = { jobs: [
    {id:"ats",sourceId:"a",url:"https://jobs.ashbyhq.com/co/role?utm_source=search",closed:false},
    {id:"aggregate",sourceId:"b",applyUrl:"https://jobs.ashbyhq.com/co/role/application?ref=board",closed:false},
    {id:"other",url:"https://jobs.ashbyhq.com/co/other"},
  ], applications:[{id:"saved",jobId:"aggregate",resume:"Original saved facts",letter:"Saved letter"}] };
  mergeDuplicateJobs(state);
  assert.equal(state.jobs.length,2);
  assert.equal(state.applications[0].resume,"Original saved facts");
  assert.equal(state.applications[0].jobId,"aggregate");
  assert.equal(state.jobs.find(x=>x.id==="aggregate").sourceRefs.length,2);
  assert.notEqual(vacancyKey({url:"https://example.com/job?id=1"}),vacancyKey({url:"https://example.com/job?id=2"}));
});
test("HiringCafe link is labeled accurately; employer URL takes priority", () => {
  assert.equal(applicationLink({url:"https://hiringcafe.com/job/abc"}).label,"Open HiringCafe listing");
  assert.equal(applicationLink({url:"https://hiringcafe.com/job/abc",employerApplyUrl:"https://jobs.lever.co/co/abc"}).label,"Apply on employer website");
});
test("Workable general portal is browse-only and employer feeds use the documented public endpoint", async () => {
  assert.equal(boardFromUrl("https://jobs.workable.com/").type,"research");
  const board = boardFromUrl("https://apply.workable.com/example-company/");
  assert.equal(board.type,"workable");
  const jobs = await readWorkable({...board,id:"s"}, async url => {
    assert.equal(url,"https://www.workable.com/api/accounts/example-company?details=true");
    return Response.json({name:"Example",jobs:[{shortcode:"ABC",title:"Analyst",description:"SQL reporting",city:"Lagos",country:"Nigeria",workplace_type:"hybrid",url:"https://apply.workable.com/example-company/j/ABC/"}]});
  });
  assert.equal(jobs[0].arrangement,"hybrid");
  assert.equal(jobs[0].country,"Nigeria");
});
