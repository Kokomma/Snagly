import { createHash, randomUUID } from "node:crypto";
import { researchSourceFor } from "./research-sources.mjs";
export const now = () => new Date().toISOString();
export const uid = () => randomUUID();
export const clean = (v) =>
  String(v ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(
      /&nbsp;|&amp;|&lt;|&gt;|&#39;|&quot;/g,
      (x) =>
        ({
          "&nbsp;": " ",
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&#39;": "'",
          "&quot;": '"',
        })[x],
    )
    .replace(/\s+/g, " ")
    .trim();
export const categories = [
  "Finance & Accounting",
  "Data & Analytics",
  "Operations",
  "Product & Technology",
  "Sales & Marketing",
  "People & Support",
  "Other",
];
export function category(text) {
  return [
    /account|financ|audit|tax|treasury/i,
    /data|analy|business intelligence/i,
    /operat|project|supply|logistics/i,
    /engineer|develop|product|design|software/i,
    /sales|market|growth|content/i,
    /people|human resources|recruit|customer|support/i,
  ].reduce(
    (r, re, i) => (r === "Other" && re.test(text) ? categories[i] : r),
    "Other",
  );
}
export function initialState() {
  return {
    profile: {
      name: "",
      email: "",
      country: "",
      cities: "",
      skills: "",
      careerHistory: "",
      categories: [],
      authorizedCountries: "",
      timezone: "Africa/Lagos",
    },
    preferences: {
      remote: { enabled: true, country: "Worldwide", cities: "" },
      hybrid: { enabled: true, country: "", cities: "" },
      onsite: { enabled: true, country: "", cities: "" },
      minScore: 60,
      dailyLimit: 5,
      minSalary: 0,
      mode: "review",
      submissionsEnabled: false,
    },
    sources: [],
    jobs: [],
    applications: [],
    activity: [],
    notifications: [],
    lastRun: null,
    revision: 0,
  };
}
export function event(s, type, message, jobId) {
  s.activity.unshift({ id: uid(), type, message, jobId, at: now() });
  s.activity = s.activity.slice(0, 2000);
}
export function notify(s, message, key) {
  if (!s.notifications.some((n) => n.key === key))
    s.notifications.unshift({
      id: uid(),
      key,
      message,
      at: now(),
      read: false,
    });
  s.notifications = s.notifications.slice(0, 300);
}
const terms = (v) =>
  String(v || "")
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
const contains = (hay, needle) =>
  hay.toLowerCase().includes(needle.toLowerCase());
const sameCountry = (a, b) =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
export function analyze(job, profile, preferences) {
  const text = `${job.title} ${job.description}`,
    skills = terms(profile.skills);
  const known = typeof job.description !== "string" && job._skillProfile === (profile.skills || "") ? job._skillMatches : null;
  const matched = skills.filter((s) => known ? known.includes(s) : contains(text, s)),
    missing = skills.filter((s) => !matched.includes(s));
  const pref = preferences[job.arrangement];
  let location = "unknown",
    reasons = [];
  if (pref && !pref.enabled) {
    location = "excluded";
    reasons.push("Work arrangement disabled in preferences.");
  } else if (pref) {
    const country = pref.country || profile.country;
    if (job.arrangement === "remote") {
      if (
        country &&
        country !== "Worldwide" &&
        job.countries.length &&
        !job.countries.some(
          (c) => sameCountry(c, country) || /^worldwide$|^global$/i.test(c),
        )
      )
        location = "excluded";
      else if (job.countries.some((c) => /^worldwide$|^global$/i.test(c)))
        location = "matched";
      else if (
        country &&
        country !== "Worldwide" &&
        job.countries.some((c) => sameCountry(c, country))
      )
        location = "matched";
      else if (
        country === "Worldwide" &&
        profile.country &&
        job.countries.some((c) => sameCountry(c, profile.country))
      )
        location = "matched";
    } else if (country && job.country) {
      location = sameCountry(job.country, country) ? "matched" : "excluded";
      if (
        location === "matched" &&
        terms(pref.cities).length &&
        !terms(pref.cities).some((c) => contains(job.city || job.location, c))
      )
        location = "excluded";
    }
  }
  if (location === "unknown")
    reasons.push(
      "Location or remote region needs confirmation; remote does not imply worldwide eligibility.",
    );
  if (location === "excluded")
    reasons.push("Outside your saved work location preferences.");
  const authorized = terms(profile.authorizedCountries);
  const eligible =
    job.eligibilityConfirmed === true
      ? "confirmed"
      : job.eligibilityConfirmed === false
        ? "ineligible"
        : "unknown";
  if (eligible === "unknown")
    reasons.push(
      "Work authorization and employer restrictions need your review.",
    );
  if (!authorized.length)
    reasons.push("Add your work authorization countries to your profile.");
  const score = skills.length
    ? Math.round((matched.length / skills.length) * 100)
    : 0;
  return {
    score,
    matched,
    missing,
    location,
    eligibility: eligible,
    reasons,
    category: job.category || job._category || category(text),
    basis:
      "Keyword overlap with your declared skills; not a hiring probability.",
  };
}
export function tailor(job, profile) {
  const lines = String(profile.careerHistory || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  const skills = terms(profile.skills).filter((x) =>
    contains(`${job.title} ${job.description}`, x),
  );
  const selected = [...lines].sort(
    (a, b) =>
      skills.filter((x) => contains(b, x)).length -
      skills.filter((x) => contains(a, x)).length,
  );
  const resume = [
    profile.name,
    profile.email,
    profile.country,
    `\nTARGET ROLE\n${job.title} · ${job.company}`,
    `\nRELEVANT SKILLS\n${skills.length ? skills.join(", ") : "Review your profile against this role."}`,
    `\nCAREER HISTORY · supplied by you\n${selected.join("\n")}`,
  ].join("\n");
  const letter = `Dear ${job.company} hiring team,\n\nI am applying for the ${job.title} position.${skills.length ? ` My background includes ${skills.join(", ")}.` : ""}\n\n${selected.length ? `Relevant experience from my career history:\n${selected.slice(0, 3).join("\n")}` : "I would welcome the opportunity to discuss my background with you."}\n\nThank you for considering my application.\n\n${profile.name}\n${profile.email}`;
  return {
    resume,
    letter,
    method:
      "Evidence-based template: reorders your own career history and highlights declared matching skills. Review before use.",
    createdAt: now(),
  };
}
export function packageHash(a) {
  if (typeof a.resume !== "string" && a._packageHash) return a._packageHash;
  return createHash("sha256")
    .update(
      JSON.stringify([a.jobId, a.recipient, a.resume, a.letter, a.subject]),
    )
    .digest("hex");
}
export function profileHash(s) {
  return createHash("sha256").update(JSON.stringify(s.profile)).digest("hex");
}
export function autoBlockers(s, a, env = process.env) {
  const j = s.jobs.find((j) => j.id === a.jobId);
  if (!j) return ["Job missing."];
  const m = analyze(j, s.profile, s.preferences),
    blockers = [];
  if (
    env.ENABLE_SUBMISSIONS !== "true" ||
    !(s.emailConnection
      ? s.emailConnection.provider === "gmail"
        ? env.CONNECTOR_GMAIL
        : env.CONNECTOR_OUTLOOK
      : env.RESEND_API_KEY && env.APPLICATION_FROM)
  )
    blockers.push(
      "Connect your email in Settings; the app email service must also be activated.",
    );
  if (
    s.emailConnection &&
    s.emailConnection.email.toLowerCase() !== s.profile.email.toLowerCase()
  )
    blockers.push("Your profile email must match your connected mailbox.");
  if (!s.preferences.submissionsEnabled)
    blockers.push("Submission permission is off.");
  if (
    !a.approval ||
    a.approval.hash !== packageHash(a) ||
    a.approval.profileHash !== profileHash(s) ||
    Date.parse(a.approval.expiresAt) < Date.now()
  )
    blockers.push(
      "Exact application package and recipient need current preapproval.",
    );
  if (!a.recipient || a.channel !== "email")
    blockers.push("A verified email application recipient is required.");
  if (!s.profile.name || !s.profile.email || !s.profile.careerHistory)
    blockers.push("Complete your career profile first.");
  if (m.eligibility !== "confirmed" || m.location !== "matched")
    blockers.push("Confirm eligibility and match location preferences.");
  if (m.score < s.preferences.minScore)
    blockers.push("Below your minimum skill match.");
  if (
    s.preferences.minSalary > 0 &&
    (!j.salaryMonthlyUsd || j.salaryMonthlyUsd < s.preferences.minSalary)
  )
    blockers.push("Salary floor is not confirmed.");
  if (j.closed) blockers.push("Vacancy is no longer listed by the source.");
  if (j.sourceId) {
    const source = s.sources.find((x) => x.id === j.sourceId);
    if (
      !source ||
      source.error ||
      !source.lastSuccessAt ||
      Date.now() - Date.parse(source.lastSuccessAt) > 2 * 60 * 60 * 1000
    )
      blockers.push(
        "The source needs a successful recent check before sending.",
      );
  }
  if (researchSourceFor(j.url))
    blockers.push(
      "This research source supports manual applications only. Complete the application on the original site.",
    );
  if (a.status !== "approved")
    blockers.push("Application is not approved for submission.");
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: s.profile.timezone,
  }).format(new Date());
  if (
    s.applications.filter((x) => {
      const t =
        x.submittedAt ||
        (["sending", "uncertain"].includes(x.status) ? x.attemptedAt : null);
      return (
        t &&
        new Intl.DateTimeFormat("en-CA", {
          timeZone: s.profile.timezone,
        }).format(new Date(t)) === day
      );
    }).length >= s.preferences.dailyLimit
  )
    blockers.push("Daily submission limit reached.");
  if (
    s.applications.some(
      (x) =>
        x.id !== a.id &&
        x.jobId === a.jobId &&
        ["submitted", "sending", "uncertain", "interview", "offer"].includes(
          x.status,
        ),
    )
  )
    blockers.push("Duplicate application blocked.");
  return blockers;
}
