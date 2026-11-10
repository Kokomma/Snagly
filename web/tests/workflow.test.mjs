import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  analyze,
  tailor,
  autoBlockers,
  packageHash,
  profileHash,
} from "../lib/model.mjs";
import { mutate, prepare, backgroundPrepare, schema } from "../lib/actions.mjs";
import { discover, readSource } from "../lib/sources.mjs";
import { sendApproved } from "../lib/submissions.mjs";
const env = {
  ENABLE_SUBMISSIONS: "true",
  RESEND_API_KEY: "test-only",
  APPLICATION_FROM: "test@example.com",
};
function fixture() {
  const s = initialState();
  s.profile = {
    ...s.profile,
    name: "Test Applicant",
    email: "test@example.com",
    country: "Nigeria",
    skills: "Excel, SQL",
    careerHistory:
      "Analyst at Example, 2021–2025\nBuilt SQL reports using Excel.",
    authorizedCountries: "Nigeria",
  };
  s.preferences.submissionsEnabled = true;
  s.preferences.minScore = 50;
  s.jobs = [
    {
      id: "j1",
      title: "Data Analyst",
      company: "Example",
      description: "SQL and Excel reporting",
      arrangement: "remote",
      countries: ["Worldwide"],
      country: "",
      city: "",
      eligibilityConfirmed: true,
      url: "https://example.com/job",
      discoveredAt: new Date().toISOString(),
    },
  ];
  prepare(s, s.jobs[0]);
  const a = s.applications[0];
  a.recipient = "jobs@example.com";
  mutate(s, {
    action: "approve",
    id: a.id,
    truthConfirmed: true,
    recipientConfirmed: true,
  });
  return s;
}
const tx = (s) => async (fn) => {
  const result = await fn(s);
  s.revision++;
  return result;
};
test("remote is not inferred to be worldwide or country eligible", () => {
  const s = fixture(),
    j = { ...s.jobs[0], countries: [], eligibilityConfirmed: null };
  const m = analyze(j, s.profile, s.preferences);
  assert.equal(m.location, "unknown");
  assert.equal(m.eligibility, "unknown");
  assert.equal(m.score, 100);
});
test("per-arrangement countries and cities remain independent", () => {
  const s = fixture();
  s.preferences.onsite = { enabled: true, country: "Nigeria", cities: "Abuja" };
  s.preferences.hybrid = { enabled: true, country: "Nigeria", cities: "" };
  const j = {
    ...s.jobs[0],
    country: "Nigeria",
    city: "Lagos",
    location: "Lagos",
    arrangement: "onsite",
  };
  assert.equal(analyze(j, s.profile, s.preferences).location, "excluded");
  assert.equal(
    analyze({ ...j, arrangement: "hybrid" }, s.profile, s.preferences).location,
    "matched",
  );
  assert.equal(
    analyze({ ...j, city: "Abuja" }, s.profile, s.preferences).location,
    "matched",
  );
});
test("country names are compared exactly and worldwide preference includes verified residence", () => {
  const s = fixture();
  s.preferences.onsite.country = "Niger";
  assert.equal(
    analyze(
      { ...s.jobs[0], arrangement: "onsite", country: "Nigeria" },
      s.profile,
      s.preferences,
    ).location,
    "excluded",
  );
  assert.equal(
    analyze({ ...s.jobs[0], countries: ["Nigeria"] }, s.profile, s.preferences)
      .location,
    "matched",
  );
});
test("tailoring uses supplied facts without inventing qualifications", () => {
  const s = fixture(),
    d = tailor(s.jobs[0], s.profile);
  assert.ok(d.resume.includes("Analyst at Example, 2021–2025"));
  assert.ok(d.letter.includes("Built SQL reports using Excel."));
  assert.ok(!d.resume.includes("PhD"));
  assert.match(d.method, /Evidence-based template/);
});
test("server permission, profile, recipient, package hash, location and salary gates fail closed", () => {
  const s = fixture(),
    a = s.applications[0];
  assert.deepEqual(autoBlockers(s, a, env), []);
  assert.ok(autoBlockers(s, a, {}).length);
  a.letter += " changed";
  assert.match(autoBlockers(s, a, env).join(" "), /preapproval/);
  a.approval.hash = packageHash(a);
  s.profile.skills += " Python";
  assert.match(autoBlockers(s, a, env).join(" "), /preapproval/);
  a.approval.profileHash = profileHash(s);
  s.preferences.minSalary = 100;
  assert.match(autoBlockers(s, a, env).join(" "), /Salary/);
});
test("saving profile or draft invalidates approval", () => {
  const s = fixture();
  mutate(s, { action: "profile", profile: { ...s.profile, name: "Updated" } });
  assert.equal(s.applications[0].approval, null);
  assert.equal(s.applications[0].status, "draft");
});
test("background prepares matching jobs across career categories once", () => {
  const s = fixture();
  s.jobs.push({ ...s.jobs[0], id: "j2", title: "Finance Analyst" });
  backgroundPrepare(s);
  backgroundPrepare(s);
  assert.equal(s.applications.length, 2);
});
test("successful email records provider receipt and duplicate send is blocked", async () => {
  const s = fixture(),
    a = s.applications[0];
  let calls = 0;
  const fake = async (url, opt) => {
    calls++;
    assert.equal(
      s.applications[0].status,
      "sending",
      "reservation committed before provider call",
    );
    assert.ok(opt.headers["Idempotency-Key"]);
    assert.equal(JSON.parse(opt.body).to[0], "jobs@example.com");
    return new Response(JSON.stringify({ id: "fake-receipt" }));
  };
  await sendApproved(a.id, {}, fake, env, tx(s));
  assert.equal(a.status, "submitted");
  assert.equal(a.receipt.id, "fake-receipt");
  assert.ok(a.followUpAt);
  await assert.rejects(
    () => sendApproved(a.id, {}, fake, env, tx(s)),
    /not approved/,
  );
  assert.equal(calls, 1);
});
test("uncertain send stays locked and counts towards daily cap", async () => {
  const s = fixture(),
    a = s.applications[0];
  await sendApproved(
    a.id,
    {},
    async () => {
      throw new Error("timeout");
    },
    env,
    tx(s),
  );
  assert.equal(a.status, "uncertain");
  await assert.rejects(
    () => sendApproved(a.id, {}, fetch, env, tx(s)),
    /not approved/,
  );
  s.preferences.dailyLimit = 1;
  s.jobs.push({ ...s.jobs[0], id: "j2" });
  prepare(s, s.jobs[1]);
  const b = s.applications[1];
  b.recipient = "jobs@example.com";
  mutate(s, { action: "approve", id: b.id });
  assert.match(autoBlockers(s, b, env).join(" "), /Daily submission limit/);
});
test("automatic mode and stale revisions are checked inside send reservation", async () => {
  const s = fixture();
  await assert.rejects(
    () =>
      sendApproved(
        s.applications[0].id,
        { automatic: true },
        fetch,
        env,
        tx(s),
      ),
    /paused/,
  );
  await assert.rejects(
    () =>
      sendApproved(s.applications[0].id, { revision: 999 }, fetch, env, tx(s)),
    /Workspace changed/,
  );
});
test("source fetch sanitizes text and never invents country eligibility", async () => {
  const jobs = await readSource(
    { id: "src", type: "greenhouse", board: "example", company: "Example" },
    async () =>
      new Response(
        JSON.stringify({
          jobs: [
            {
              id: 1,
              title: "SQL Analyst",
              location: { name: "Remote" },
              content: "<p>Use SQL</p>",
              absolute_url: "https://example.com/job",
            },
          ],
        }),
      ),
  );
  assert.equal(jobs[0].description, "Use SQL");
  assert.equal(jobs[0].arrangement, "remote");
  assert.deepEqual(jobs[0].countries, []);
  assert.equal(jobs[0].eligibilityConfirmed, null);
});
test("discovery deduplicates and only closes jobs after successful source read", async () => {
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
  const fake = async () =>
    new Response(
      JSON.stringify([
        {
          id: 1,
          text: "SQL Analyst",
          descriptionPlain: "SQL",
          hostedUrl: "https://example.com/job",
          categories: { location: "Lagos" },
          workplaceType: "on-site",
        },
      ]),
    );
  await discover(s, fake);
  await discover(s, fake);
  assert.equal(s.jobs.length, 1);
  await discover(s, async () => {
    throw new Error("network");
  });
  assert.equal(s.jobs[0].closed, false);
  await discover(s, async () => new Response("[]"));
  assert.equal(s.jobs[0].closed, true);
});
test("job changes clear approvals and reconfirmation requirement", async () => {
  const s = fixture();
  s.sources = [
    {
      id: "src",
      type: "greenhouse",
      board: "example",
      company: "Example",
      enabled: true,
    },
  ];
  Object.assign(s.jobs[0], { id: "greenhouse:example:1", sourceId: "src" });
  s.applications[0].jobId = s.jobs[0].id;
  await discover(
    s,
    async () =>
      new Response(
        JSON.stringify({
          jobs: [
            {
              id: 1,
              title: "New role",
              content: "Changed description",
              absolute_url: "https://example.com/job",
            },
          ],
        }),
      ),
  );
  assert.equal(s.jobs[0].eligibilityConfirmed, null);
  assert.equal(s.applications[0].approval, null);
});
test("input schema blocks arbitrary hosts in source IDs and sensitive automatic form answers", () => {
  assert.equal(
    schema.safeParse({
      action: "source",
      source: { type: "lever", board: "https://evil.test", company: "X" },
    }).success,
    false,
  );
  assert.equal(
    schema.safeParse({
      action: "approve",
      id: "x",
      truthConfirmed: false,
      recipientConfirmed: true,
    }).success,
    false,
  );
  assert.equal(
    schema.safeParse({
      action: "status",
      id: "x",
      status: "submitted",
      note: "",
      followUpAt: "",
    }).success,
    false,
  );
});
