import { z } from "zod";
import {
  uid,
  now,
  event,
  notify,
  analyze,
  tailor,
  packageHash,
  profileHash,
  categories,
} from "./model.mjs";
const text = z.string().trim().max(10000),
  short = z.string().trim().max(300),
  email = z.email().max(254);
const location = z.object({
  enabled: z.boolean(),
  country: short,
  cities: short,
});
export const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("profile"),
    profile: z.object({
      name: short,
      email: z.union([email, z.literal("")]),
      country: short,
      cities: short,
      skills: text,
      careerHistory: text,
      categories: z.array(z.enum(categories)).max(7),
      authorizedCountries: short,
      timezone: short.refine((v) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, "Use a valid time zone"),
    }),
  }),
  z.object({
    action: z.literal("preferences"),
    preferences: z.object({
      remote: location,
      hybrid: location,
      onsite: location,
      minScore: z.number().int().min(0).max(100),
      dailyLimit: z.number().int().min(1).max(20),
      minSalary: z.number().min(0).max(1000000),
      mode: z.enum(["review", "auto"]),
      submissionsEnabled: z.boolean(),
    }),
  }),
  z.object({
    action: z.literal("source"),
    source: z.object({
      type: z.enum(["greenhouse", "lever"]),
      board: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
      company: short.min(1),
    }),
  }),
  z.object({ action: z.literal("toggle-source"), id: short }),
  z.object({
    action: z.literal("import"),
    job: z.object({
      title: short.min(1),
      company: short.min(1),
      url: z
        .url()
        .refine((v) => v.startsWith("https://"), "Use an HTTPS job URL"),
      description: text.min(20),
      arrangement: z.enum(["remote", "hybrid", "onsite", "unknown"]),
      country: short,
      city: short,
      countries: z.array(short).max(30),
      salaryMonthlyUsd: z.number().min(0).nullable(),
    }),
  }),
  z.object({
    action: z.literal("job"),
    id: short,
    details: z.object({
      arrangement: z.enum(["remote", "hybrid", "onsite", "unknown"]),
      country: short,
      city: short,
      countries: z.array(short).max(30),
      eligibilityConfirmed: z.boolean().nullable(),
      eligibilityNote: short,
      salaryMonthlyUsd: z.number().min(0).nullable(),
    }),
  }),
  z.object({ action: z.literal("prepare"), id: short }),
  z.object({
    action: z.literal("draft"),
    id: short,
    resume: text,
    letter: text,
    subject: short.min(1),
    recipient: z.union([email, z.literal("")]),
  }),
  z.object({
    action: z.literal("approve"),
    id: short,
    truthConfirmed: z.literal(true),
    recipientConfirmed: z.literal(true),
  }),
  z.object({ action: z.literal("revoke"), id: short }),
  z.object({
    action: z.literal("tracker-note"),
    id: short,
    note: text,
    followUpAt: z.union([z.iso.datetime(), z.literal("")]),
  }),
  z.object({
    action: z.literal("status"),
    id: short,
    status: z.enum([
      "saved",
      "skipped",
      "manual",
      "interview",
      "offer",
      "rejected",
    ]),
    note: text,
    followUpAt: z.union([z.iso.datetime(), z.literal("")]),
  }),
  z.object({
    action: z.literal("manual-submitted"),
    id: short,
    note: short.min(1),
  }),
  z.object({ action: z.literal("read-notifications") }),
  z.object({ action: z.literal("followed-up"), id: short }),
  z.object({ action: z.literal("discover") }),
  z.object({ action: z.literal("submit"), id: short }),
]);
function app(s, id) {
  const a = s.applications.find((a) => a.id === id);
  if (!a) throw new Error("Application not found.");
  return a;
}
function editable(a) {
  if (
    [
      "submitted",
      "sending",
      "uncertain",
      "interview",
      "offer",
      "rejected",
    ].includes(a.status)
  )
    throw new Error(
      "This application is locked to preserve its submission record.",
    );
}
export function prepare(s, j) {
  if (s.applications.some((a) => a.jobId === j.id)) return;
  if (!s.profile.name || !s.profile.email || !s.profile.careerHistory)
    throw new Error(
      "Save your name, email and career history before preparing applications.",
    );
  const d = tailor(j, s.profile),
    a = {
      id: uid(),
      jobId: j.id,
      ...d,
      subject: `Application for ${j.title} — ${s.profile.name}`,
      recipient: "",
      channel: "email",
      status: "draft",
      approval: null,
      notes: "",
      followUpAt: null,
    };
  s.applications.push(a);
  event(
    s,
    "prepared",
    `Prepared a truthful draft for ${j.title} at ${j.company}.`,
    j.id,
  );
  return a;
}
export function mutate(s, b) {
  switch (b.action) {
    case "tracker-note": {
      const a = app(s, b.id);
      a.notes = b.note;
      a.followUpAt = b.followUpAt || null;
      event(s, "tracker", "Tracker notes and follow-up date updated.", a.jobId);
      break;
    }
    case "profile":
      s.profile = b.profile;
      for (const a of s.applications) {
        a.approval = null;
        if (a.status === "approved") a.status = "draft";
      }
      event(
        s,
        "profile",
        "Career profile updated; existing preapprovals cleared.",
      );
      break;
    case "preferences":
      s.preferences = b.preferences;
      event(
        s,
        "mode",
        `Preferences saved. ${b.preferences.mode === "auto" ? "Auto Apply" : "Review & Approve"} mode selected.`,
      );
      break;
    case "source":
      if (s.sources.length >= 12)
        throw new Error("Personal MVP supports up to 12 sources.");
      if (
        s.sources.some(
          (x) => x.type === b.source.type && x.board === b.source.board,
        )
      )
        throw new Error("Source already added.");
      s.sources.push({ id: uid(), ...b.source, enabled: true });
      event(s, "source", `Added ${b.source.company} career board.`);
      break;
    case "toggle-source": {
      const x = s.sources.find((x) => x.id === b.id);
      if (!x) throw new Error("Source missing.");
      x.enabled = !x.enabled;
      break;
    }
    case "import": {
      if (s.jobs.some((j) => j.url === b.job.url))
        throw new Error("This job URL is already saved.");
      s.jobs.unshift({
        id: uid(),
        ...b.job,
        category: undefined,
        location: [b.job.city, b.job.country].filter(Boolean).join(", "),
        applyUrl: b.job.url,
        sourceId: null,
        discoveredAt: now(),
        eligibilityConfirmed: null,
        closed: false,
      });
      event(s, "discovery", `Imported ${b.job.title} at ${b.job.company}.`);
      break;
    }
    case "job": {
      const j = s.jobs.find((x) => x.id === b.id);
      if (!j) throw new Error("Job missing.");
      if (b.details.eligibilityConfirmed === true && !b.details.eligibilityNote)
        throw new Error("Record how you confirmed employer eligibility.");
      Object.assign(j, b.details);
      j.reviewedAt = now();
      for (const a of s.applications.filter(
        (x) => x.jobId === j.id && !x.submittedAt,
      )) {
        a.approval = null;
        if (a.status === "approved") a.status = "draft";
      }
      event(
        s,
        "review",
        `Reviewed location and eligibility for ${j.title}.`,
        j.id,
      );
      break;
    }
    case "prepare": {
      const j = s.jobs.find((x) => x.id === b.id);
      if (!j) throw new Error("Job missing.");
      prepare(s, j);
      break;
    }
    case "draft": {
      const a = app(s, b.id);
      editable(a);
      Object.assign(a, {
        resume: b.resume,
        letter: b.letter,
        subject: b.subject,
        recipient: b.recipient,
        status: "draft",
        approval: null,
      });
      event(s, "draft", "Application draft saved; approval cleared.", a.jobId);
      break;
    }
    case "approve": {
      const a = app(s, b.id);
      editable(a);
      if (!a.recipient || !a.resume || !a.letter)
        throw new Error("Save the recipient, resume and letter first.");
      a.approval = {
        hash: packageHash(a),
        profileHash: profileHash(s),
        at: now(),
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      };
      a.status = "approved";
      event(
        s,
        "approved",
        "Exact email package and recipient preapproved for seven days.",
        a.jobId,
      );
      break;
    }
    case "revoke": {
      const a = app(s, b.id);
      if (a.status === "sending")
        throw new Error("Submission is already in progress.");
      a.approval = null;
      if (a.status === "approved") a.status = "draft";
      event(s, "revoked", "Preapproval revoked.", a.jobId);
      break;
    }
    case "status": {
      const a = app(s, b.id);
      if (["sending", "uncertain"].includes(a.status))
        throw new Error(
          "Resolve the provider outcome before changing this record.",
        );
      if (
        ["interview", "offer", "rejected"].includes(b.status) &&
        !a.submittedAt
      )
        throw new Error("Record the manual submission first.");
      if (a.submittedAt && ["saved", "skipped", "manual"].includes(b.status))
        throw new Error("Submission history is preserved.");
      a.status = b.status;
      a.notes = b.note;
      a.followUpAt = b.followUpAt || null;
      a.approval = null;
      event(s, "tracker", `Tracker updated: ${b.status}`, a.jobId);
      break;
    }
    case "manual-submitted": {
      const a = app(s, b.id);
      editable(a);
      a.status = "submitted";
      a.submittedAt = now();
      a.approval = null;
      a.receipt = { provider: "self-reported", note: b.note, at: now() };
      a.followUpAt = new Date(Date.now() + 7 * 86400000).toISOString();
      event(
        s,
        "submitted",
        "You recorded a completed manual application.",
        a.jobId,
      );
      break;
    }
    case "read-notifications":
      s.notifications.forEach((n) => (n.read = true));
      break;
    case "followed-up": {
      const a = app(s, b.id);
      a.followUpAt = null;
      event(s, "follow-up", "Follow-up recorded.", a.jobId);
      break;
    }
  }
}
export function backgroundPrepare(s) {
  if (!s.profile.careerHistory || !s.profile.email || !s.profile.name) return;
  const matches = s.jobs
    .filter((j) => !j.closed && !s.applications.some((a) => a.jobId === j.id))
    .filter((j) => {
      const m = analyze(j, s.profile, s.preferences);
      return (
        m.location !== "excluded" &&
        m.eligibility !== "ineligible" &&
        m.score >= s.preferences.minScore &&
        (s.profile.categories.length === 0 ||
          s.profile.categories.includes(m.category))
      );
    })
    .slice(0, 20);
  for (const j of matches) prepare(s, j);
  if (matches.length)
    notify(
      s,
      `${matches.length} application drafts prepared for review.`,
      `drafts:${now()}`,
    );
  for (const a of s.applications)
    if (
      a.followUpAt &&
      Date.parse(a.followUpAt) <= Date.now() &&
      a.status === "submitted"
    )
      notify(
        s,
        `Follow-up due: ${s.jobs.find((j) => j.id === a.jobId)?.company || "application"}`,
        `followup:${a.id}:${a.followUpAt}`,
      );
}
