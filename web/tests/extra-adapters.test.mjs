import test from "node:test";
import assert from "node:assert/strict";
import {
  readAshby,
  readHiringCafe,
  hiringCafeCall,
} from "../lib/extra-adapters.mjs";
import { discover } from "../lib/sources.mjs";
import { initialState } from "../lib/model.mjs";
import { reserveHiringCafeHour } from "../lib/source-reservations.mjs";
test("source workplace changes clear approvals while unchanged feeds preserve manual review", async () => {
  const s = initialState();
  s.sources = [
    {
      id: "src",
      type: "lever",
      board: "example",
      company: "Example",
      enabled: true,
    },
  ];
  const feed = (type) => async () =>
    Response.json([
      {
        id: "1",
        text: "Analyst",
        descriptionPlain: "SQL reporting",
        categories: { location: "Nigeria" },
        workplaceType: type,
        hostedUrl: "https://example.com/job",
        applyUrl: "https://example.com/apply",
      },
    ]);
  await discover(s, feed("remote"));
  s.jobs[0].eligibilityConfirmed = true;
  s.jobs[0].countries = ["Nigeria"];
  s.applications = [
    {
      id: "a",
      jobId: s.jobs[0].id,
      status: "approved",
      approval: { hash: "test" },
    },
  ];
  await discover(s, feed("remote"));
  assert.equal(s.jobs[0].eligibilityConfirmed, true);
  assert.ok(s.applications[0].approval);
  await discover(s, feed("hybrid"));
  assert.equal(s.jobs[0].arrangement, "hybrid");
  assert.equal(s.jobs[0].eligibilityConfirmed, null);
  assert.equal(s.applications[0].approval, null);
});
test("HiringCafe attempts reserve a clock hour and honor provider backoff", () => {
  const state = { sources: [{ id: "hc", type: "hiringcafe", enabled: true }] };
  const at = Date.parse("2026-11-10T10:00:00Z");
  assert.deepEqual(reserveHiringCafeHour(state, at), []);
  assert.deepEqual(reserveHiringCafeHour(state, at + 10000), ["hc"]);
  assert.deepEqual(reserveHiringCafeHour(state, at + 3600000), []);
  state.sources[0].nextAttemptAt = "2026-11-10T15:00:00Z";
  assert.deepEqual(reserveHiringCafeHour(state, at + 7200000), ["hc"]);
});
test("Ashby uses workplaceType rather than isRemote and excludes unlisted jobs", async () => {
  const source = {
    id: "s",
    type: "ashby",
    board: "Example",
    company: "Example",
  };
  const jobs = await readAshby(source, async (url) => {
    assert.match(url, /posting-api\/job-board\/Example/);
    return new Response(
      JSON.stringify({
        jobs: [
          {
            title: "Analyst",
            isListed: true,
            isRemote: true,
            workplaceType: "Hybrid",
            location: "London",
            descriptionPlain: "SQL reporting",
            jobUrl: "https://jobs.ashbyhq.com/Example/job-1",
            address: {
              postalAddress: {
                addressCountry: "GBR",
                addressLocality: "London",
              },
            },
          },
          { title: "Private role", isListed: false },
        ],
      }),
    );
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].arrangement, "hybrid");
  assert.equal(jobs[0].country, "United Kingdom");
  assert.equal(jobs[0].externalId, "job-1");
  assert.deepEqual(jobs[0].countries, []);
});
test("HiringCafe sends only saved search text and fetches at most five full descriptions", async () => {
  let searches = 0,
    details = 0;
  const source = {
    id: "s",
    type: "hiringcafe",
    board: "hiringcafe",
    company: "HiringCafe",
    query: "Finance and analysis, Nigeria, newest first",
  };
  const fake = async (url, opts) => {
    const d = JSON.parse(opts.body);
    if (d.params.name === "search_hiringcafe_jobs") {
      searches++;
      assert.deepEqual(d.params.arguments, { prompt: source.query, limit: 5 });
      return Response.json({
        result: {
          structuredContent: {
            jobs: Array.from({ length: 8 }, (_, i) => ({ id: String(i) })),
          },
        },
      });
    }
    details++;
    return Response.json({
      result: {
        structuredContent: {
          job: {
            id: d.params.arguments.job_id,
            title: "Analyst",
            company: "Example",
            description: "SQL reporting and analysis",
            location: "Nigeria",
            workplaceType: "Remote",
            applyUrl: "https://hiringcafe.com/job/example",
          },
        },
      },
    });
  };
  const jobs = await readHiringCafe(source, fake);
  assert.equal(searches, 1);
  assert.equal(details, 5);
  assert.equal(jobs.length, 5);
  assert.equal(jobs[0].description, "SQL reporting and analysis");
  assert.equal(jobs[0].eligibilityConfirmed, null);
});
test("HiringCafe search absence does not close earlier jobs", async () => {
  const s = initialState();
  s.sources = [
    {
      id: "s",
      type: "hiringcafe",
      board: "hiringcafe",
      company: "HC",
      query: "Analyst roles",
      enabled: true,
    },
  ];
  s.jobs = [{ id: "hiringcafe:old", sourceId: "s", closed: false }];
  await discover(s, async () =>
    Response.json({ result: { structuredContent: { jobs: [] } } }),
  );
  assert.equal(s.jobs[0].closed, false);
});
test("HiringCafe respects rate limiting and rejects tool errors", async () => {
  await assert.rejects(
    () =>
      hiringCafeCall(
        "search",
        {},
        async () =>
          new Response("", { status: 429, headers: { "retry-after": "7200" } }),
      ),
    (e) => e.retryAfter === 7200,
  );
  await assert.rejects(
    () =>
      hiringCafeCall("search", {}, async () =>
        Response.json({ result: { isError: true } }),
      ),
    /could not complete/,
  );
});
