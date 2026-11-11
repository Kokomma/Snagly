import { clean, category, now } from "./model.mjs";
const https = (v) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
};
const arrangement = (v) =>
  ({
    remote: "remote",
    hybrid: "hybrid",
    onsite: "onsite",
    "on-site": "onsite",
  })[String(v || "").toLowerCase()] || "unknown";
function base(source, j) {
  return {
    sourceId: source.id,
    title: clean(j.title),
    company: clean(j.company || source.company),
    description: clean(
      j.description || j.descriptionPlain || j.descriptionHtml,
    ).slice(0, 12000),
    location: clean(j.location),
    arrangement: arrangement(j.workplaceType),
    country: "",
    city: "",
    countries: [],
    category: category(`${j.title} ${j.department || ""}`),
    discoveredAt: now(),
    eligibilityConfirmed: null,
    salaryMonthlyUsd: null,
    closed: false,
  };
}
export async function readAshby(source, fetcher = fetch) {
  const r = await fetcher(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(source.board)}?includeCompensation=true`,
    {
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
      redirect: "error",
    },
  );
  if (!r.ok) throw new Error(`Ashby returned HTTP ${r.status}`);
  const raw = await r.text();
  if (raw.length > 8_000_000)
    throw new Error("Ashby response exceeds size limit.");
  const data = JSON.parse(raw);
  if (!Array.isArray(data.jobs))
    throw new Error("Ashby did not return a job list.");
  return data.jobs
    .filter((j) => j.isListed !== false)
    .slice(0, 1500)
    .map((j) => {
      const url = https(j.jobUrl),
        id = j.id || url.split("/").filter(Boolean).at(-1),
        postal = j.address?.postalAddress || {};
      let country = postal.addressCountry || "";
      const aliases = {
        USA: "US",
        GBR: "GB",
        NGA: "NG",
        CAN: "CA",
        DEU: "DE",
        FRA: "FR",
        IND: "IN",
        ZAF: "ZA",
      };
      const code = aliases[country] || country;
      if (/^[A-Z]{2}$/.test(code))
        country = new Intl.DisplayNames(["en"], { type: "region" }).of(code);
      return {
        ...base(source, j),
        id: `ashby:${source.board}:${id}`,
        externalId: String(id),
        url,
        applyUrl: https(j.applyUrl) || url,
        postedAt: j.publishedAt || null,
        country,
        city: clean(postal.addressLocality),
        salaryDescription: clean(
          j.compensation?.scrapeableCompensationSalarySummary,
        ),
      };
    })
    .filter((j) => j.url && j.title && j.externalId);
}
export async function readWorkable(source, fetcher = fetch) {
  const r = await fetcher(`https://www.workable.com/api/accounts/${encodeURIComponent(source.board)}?details=true`, {
    signal: AbortSignal.timeout(15000), cache: "no-store", redirect: "error",
  });
  if (!r.ok) throw new Error(`Workable returned HTTP ${r.status}. The company feed may be unavailable; try its employer page.`);
  const raw = await r.text();
  if (raw.length > 8000000) throw new Error("Workable response exceeds size limit.");
  const data = JSON.parse(raw);
  if (!Array.isArray(data.jobs)) throw new Error("Workable did not return a public company job feed.");
  return data.jobs.slice(0,1500).map(j => {
    const url = https(j.application_url || j.shortlink || j.url);
    return { ...base(source, { ...j, company: data.name || source.company, workplaceType: j.workplace_type === "on_site" ? "onsite" : j.workplace_type || (j.telecommuting ? "remote" : "unknown") }),
      id: `workable:${source.board}:${j.shortcode || j.code}`, externalId: String(j.shortcode || j.code || ""), url,
      applyUrl: https(j.url) || url, country: clean(j.country), city: clean(j.city), location: clean([j.city,j.country].filter(Boolean).join(", ")),
      postedAt: j.published_on || j.created_at || null,
    };
  }).filter(j => j.externalId && j.url && j.title);
}
export async function hiringCafeCall(name, args, fetcher = fetch) {
  const r = await fetcher("https://hiringcafe.com/api/chatgpt/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
    signal: AbortSignal.timeout(22000),
    redirect: "error",
    cache: "no-store",
  });
  if (!r.ok) {
    const e = new Error(`HiringCafe returned HTTP ${r.status}`);
    if (r.status === 429)
      e.retryAfter = Number(r.headers.get("retry-after")) || 3600;
    throw e;
  }
  const raw = await r.text();
  if (raw.length > 2_000_000)
    throw new Error("HiringCafe response exceeds size limit.");
  const d = JSON.parse(raw);
  if (d.error || d.result?.isError)
    throw new Error(
      "HiringCafe could not complete this search. Review the saved criteria or try a later hour.",
    );
  const value = d.result?.structuredContent;
  if (!value)
    throw new Error("HiringCafe returned an unsupported response format.");
  return value;
}
export async function readHiringCafe(source, fetcher = fetch) {
  if (!source.query?.trim())
    throw new Error("Save your HiringCafe search criteria first.");
  const data = await hiringCafeCall(
    "search_hiringcafe_jobs",
    { prompt: source.query, limit: 5 },
    fetcher,
  );
  if (!Array.isArray(data.jobs))
    throw new Error("HiringCafe did not return a job list.");
  const details = await Promise.allSettled(
    data.jobs.slice(0, 5).map(async (j) => {
      const d = await hiringCafeCall(
        "get_hiringcafe_job_details",
        { job_id: j.id },
        fetcher,
      );
      const full = d.job;
      if (!full?.id || !full.description) return null;
      const url = https(full.applyUrl);
      return {
        ...base(source, full),
        id: `hiringcafe:${full.id}`,
        externalId: full.id,
        originSite: "HiringCafe",
        url,
        applyUrl: url,
        postedAt: full.datePosted || null,
      };
    }),
  );
  if (details.length && details.every((d) => d.status === "rejected"))
    throw details[0].reason;
  source.warning = details.some((d) => d.status === "rejected")
    ? "Some HiringCafe details were unavailable; partial results saved."
    : null;
  const limited = details.find(
    (d) => d.status === "rejected" && d.reason.retryAfter,
  );
  if (limited)
    source.nextAttemptAt = new Date(
      Date.now() + limited.reason.retryAfter * 1000,
    ).toISOString();
  return details
    .filter((d) => d.status === "fulfilled")
    .map((d) => d.value)
    .filter((j) => j?.url && j.title);
}
