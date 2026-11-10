// Run against an empty, local-only test server. Uses no external submission provider.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { initialState } from "../lib/model.mjs";
const origin = process.env.TEST_ORIGIN || "http://127.0.0.1:3000";
let cookie = "",
  revision = 0;
async function request(path, body, auth = true, originHeader = origin) {
  const r = await fetch(origin + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body
        ? { "Content-Type": "application/json", Origin: originHeader }
        : {}),
      ...(auth && cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = await r.json();
  return { r, data };
}
let backup;
try {
  backup = await readFile(".data/state.json", "utf8");
  assert.equal(
    JSON.parse(backup).profile.name,
    "",
    "Use a blank local test workspace.",
  );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  backup = JSON.stringify(initialState());
}
async function load() {
  const { r, data } = await request("/api/workspace");
  assert.equal(r.status, 200);
  revision = data.state.revision;
  return data.state;
}
async function action(body) {
  const { r, data } = await request("/api/workspace", { ...body, revision });
  assert.equal(r.status, 200, JSON.stringify(data));
  return load();
}
try {
  assert.equal((await request("/api/workspace", null, false)).r.status, 401);
  const login = await request("/api/auth", {
    password: process.env.TEST_OWNER_PASSWORD || "snagly-local-test-only",
  });
  assert.equal(login.r.status, 200, JSON.stringify(login.data));
  cookie = login.r.headers.get("set-cookie").split(";")[0];
  await load();
  assert.equal(
    (
      await request(
        "/api/workspace",
        { action: "read-notifications", revision },
        true,
        "https://example.org",
      )
    ).r.status,
    400,
  );
  let s = await action({
    action: "profile",
    profile: {
      ...initialState().profile,
      name: "Test Person",
      email: "test@example.com",
      country: "Nigeria",
      authorizedCountries: "Nigeria",
      skills: "SQL, Excel",
      careerHistory: "Analyst at Example.\nCreated SQL reports with Excel.",
    },
  });
  s = await action({
    action: "import",
    job: {
      title: "Analyst",
      company: "Example",
      url: "https://example.com/test-only-vacancy",
      description: "Seeking an analyst with SQL and Excel reporting skills.",
      arrangement: "remote",
      country: "",
      city: "",
      countries: ["Worldwide"],
      salaryMonthlyUsd: null,
    },
  });
  const j = s.jobs[0];
  assert.equal(j.match.score, 100);
  assert.equal(j.match.eligibility, "unknown");
  s = await action({
    action: "job",
    id: j.id,
    details: {
      arrangement: "remote",
      country: "",
      city: "",
      countries: ["Worldwide"],
      eligibilityConfirmed: true,
      eligibilityNote: "Synthetic fixture; not a real vacancy.",
      salaryMonthlyUsd: null,
    },
  });
  s = await action({ action: "prepare", id: j.id });
  const a = s.applications[0];
  assert.match(a.resume, /Created SQL reports/);
  s = await action({
    action: "draft",
    id: a.id,
    subject: a.subject,
    resume: a.resume,
    letter: a.letter,
    recipient: "jobs@example.com",
  });
  s = await action({
    action: "approve",
    id: a.id,
    truthConfirmed: true,
    recipientConfirmed: true,
  });
  assert.equal(s.applications[0].status, "approved");
  assert.equal(
    (await request("/api/workspace", { action: "submit", id: a.id, revision }))
      .r.status,
    400,
    "No provider or sending permission is configured.",
  );
  assert.equal(
    (
      await request("/api/workspace", {
        action: "read-notifications",
        revision: 999999,
      })
    ).r.status,
    400,
  );
  assert.equal((await request("/api/cron")).r.status, 401);
  assert.equal(
    (await load()).applications[0].status,
    "approved",
    "Failed send does not claim success.",
  );
  console.log(
    "PASS: owner sign-in, CSRF, profile persistence, job import, match, eligibility, preparation, exact approval, disabled submission, stale writes and cron authentication. No external submission made.",
  );
} finally {
  await writeFile(".data/state.json", backup, "utf8");
}
