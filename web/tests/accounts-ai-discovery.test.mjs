import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  withWorkspace,
  workspaceIdentity,
  workspaceDocument,
} from "../lib/workspace-context.mjs";
import { transact } from "../lib/store.mjs";
import { initialState } from "../lib/model.mjs";
import { migratedState, hasPersonalWork } from "../lib/legacy-migration.mjs";
import { accountIdentityFromCookie } from "../lib/account-auth.mjs";
import {
  boardFromUrl,
  ensureDiscoverySources,
  profileSearch,
} from "../lib/board-links.mjs";
import { validateEvidence, tailorWithAI } from "../lib/ai.mjs";
import { mailboxParams, gmailRaw } from "../lib/mailbox.mjs";
test("workspace access requires authenticated context and isolates concurrent accounts", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "snagly-account-"));
  const before = process.env.SNAGLY_DATA_DIRECTORY;
  process.env.SNAGLY_DATA_DIRECTORY = dir;
  try {
    assert.throws(() => workspaceIdentity(), /authenticated/);
    assert.throws(() => workspaceDocument({ uid: "../owner" }), /Invalid/);
    await Promise.all(
      ["alice", "brother"].map((uid) =>
        withWorkspace(
          { uid, legacy: false, email: uid + "@example.invalid" },
          async () => {
            await transact((s) => {
              s.profile.skills = uid;
              s.jobs.push({ id: uid });
            });
            await new Promise((r) => setTimeout(r, 5));
            assert.equal(workspaceIdentity().uid, uid);
            const s = await transact((s) => s, { readOnly: true });
            assert.equal(s.profile.skills, uid);
            assert.deepEqual(s.jobs, [{ id: uid }]);
          },
        ),
      ),
    );
  } finally {
    if (before === undefined) delete process.env.SNAGLY_DATA_DIRECTORY;
    else process.env.SNAGLY_DATA_DIRECTORY = before;
    await rm(dir, { recursive: true, force: true });
  }
});
test("sessions use verified UID and current user record, rejecting disabled accounts", async () => {
  const identity = await accountIdentityFromCookie(
    "fixture",
    async () => ({ uid: "server-uid", email: "stale@example.invalid" }),
    async (uid) => ({
      uid,
      email: "real@example.invalid",
      displayName: "Real",
      emailVerified: true,
    }),
  );
  assert.equal(identity.uid, "server-uid");
  assert.equal(identity.email, "real@example.invalid");
  assert.equal(identity.verified, true);
  await assert.rejects(
    () =>
      accountIdentityFromCookie(
        "fixture",
        async () => ({ uid: "server-uid" }),
        async () => ({ disabled: true }),
      ),
    /Sign in/i,
  );
});
test("legacy migration preserves original data and clears sending authority", () => {
  const original = initialState();
  original.profile.careerHistory = "Real history";
  original.preferences.mode = "auto";
  original.preferences.submissionsEnabled = true;
  original.applications = [
    { id: "a", status: "approved", approval: { hash: "old" } },
  ];
  const migrated = migratedState(original, {
    uid: "a",
    name: "A",
    email: "a@example.invalid",
  });
  assert.equal(original.applications[0].status, "approved");
  assert.equal(migrated.profile.careerHistory, "Real history");
  assert.equal(migrated.preferences.submissionsEnabled, false);
  assert.equal(migrated.applications[0].approval, null);
  assert.equal(hasPersonalWork(migrated), true);
  assert.equal(hasPersonalWork(initialState()), false);
  const preferencesOnly = initialState();
  preferencesOnly.preferences.minScore = 80;
  assert.equal(hasPersonalWork(preferencesOnly), true);
});
test("career links recognize providers and reject deceptive or private hosts", () => {
  for (const [url, type, board] of [
    ["https://job-boards.greenhouse.io/acme/jobs/42", "greenhouse", "acme"],
    ["https://jobs.lever.co/acme", "lever", "acme"],
    ["https://jobs.ashbyhq.com/acme/123", "ashby", "acme"],
    ["https://hiringcafe.com/", "hiringcafe", "hiringcafe"],
  ])
    assert.deepEqual(
      [boardFromUrl(url).type, boardFromUrl(url).board],
      [type, board],
    );
  for (const url of [
    "http://localhost",
    "https://127.0.0.1",
    "https://jobs.lever.co.evil.test/acme",
    "https://jobs.lever.co@evil.test/acme",
    "https://jobs.lever.co/../../x",
  ])
    assert.throws(() => boardFromUrl(url));
});
test("profile automatically initializes all four providers without leaking CV or email into search", () => {
  const s = initialState();
  s.profile.skills = "SQL";
  s.profile.careerHistory = "Private employer history";
  s.profile.email = "private@example.invalid";
  s.profile.country = "Nigeria";
  ensureDiscoverySources(s);
  const count = s.sources.length;
  ensureDiscoverySources(s);
  assert.equal(s.sources.length, count);
  assert.equal(new Set(s.sources.map((x) => x.type)).size, 4);
  const query = profileSearch(s.profile, s.preferences);
  assert.ok(query.includes("SQL"));
  assert.ok(!query.includes(s.profile.careerHistory));
  assert.ok(!query.includes(s.profile.email));
});
test("AI evidence rejects unknown references and invented metrics", () => {
  assert.throws(
    () =>
      validateEvidence(
        {
          summary: "",
          bullets: [{ text: "SQL", evidenceIds: [2] }],
          coverLetter: "",
          networkingDraft: "",
        },
        ["SQL"],
      ),
    /evidence/,
  );
  assert.throws(
    () =>
      validateEvidence(
        {
          summary: "Improved 80%",
          bullets: [{ text: "SQL", evidenceIds: [0] }],
          coverLetter: "",
          networkingDraft: "",
        },
        ["SQL"],
      ),
    /number/,
  );
});
test("free quota exhaustion queues without changing the application or approval", async () => {
  const old = { ...process.env };
  Object.assign(process.env, {
    GOOGLE_FREE_TIER_CONFIRMED: "true",
    GOOGLE_GENERATIVE_AI_API_KEY: "test-only",
    AI_FREE_MODEL: "test-only",
  });
  const s = initialState();
  s.ai = { enabled: true };
  s.profile.skills = "SQL";
  s.profile.careerHistory = "Built SQL reports";
  s.jobs = [
    { id: "job", description: "SQL", title: "Analyst", company: "Example" },
  ];
  s.applications = [
    {
      id: "a",
      jobId: "job",
      status: "draft",
      resume: "preserved",
      approval: null,
    },
  ];
  const tx = async (fn) => fn(s);
  try {
    const result = await tailorWithAI(
      "job",
      {},
      async () => {
        const e = new Error("quota");
        e.statusCode = 429;
        throw e;
      },
      tx,
    );
    assert.equal(result.queued, true);
    assert.deepEqual(s.ai.queue, ["job"]);
    assert.equal(s.applications[0].resume, "preserved");
    assert.ok(Date.parse(s.ai.nextAttemptAt) > Date.now());
    let called = false;
    await tailorWithAI(
      "job",
      {},
      async () => {
        called = true;
      },
      tx,
    );
    assert.equal(called, false);
  } finally {
    for (const k of [
      "GOOGLE_FREE_TIER_CONFIRMED",
      "GOOGLE_GENERATIVE_AI_API_KEY",
      "AI_FREE_MODEL",
    ])
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
  }
});
test("mailbox consent is bound to authenticated UID and MIME cannot inject recipient headers", () => {
  assert.throws(
    () =>
      mailboxParams("gmail", { uid: "owner", legacy: true, verified: true }),
    /verified/,
  );
  const p = mailboxParams("outlook", { uid: "brother", verified: true });
  assert.equal(p.subject.id, "brother");
  assert.ok(p.scopes.includes("Mail.Send"));
  assert.ok(!p.scopes.includes("Mail.Read"));
  const mime = Buffer.from(
    gmailRaw(
      {
        id: "a",
        recipient: "jobs@example.invalid\r\nBcc: evil@example.invalid",
        subject: "Role",
        letter: "Letter",
        resume: "Exact CV",
      },
      "me@example.invalid",
    ),
    "base64url",
  ).toString();
  assert.ok(!mime.includes("\r\nBcc:"));
  assert.ok(mime.includes(Buffer.from("Exact CV").toString("base64")));
});
