import { clean, category, now, event, notify } from "./model.mjs";
const safeUrl = (v) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
};
export async function readSource(source, fetcher = fetch) {
  const board = encodeURIComponent(source.board);
  const endpoint =
    source.type === "greenhouse"
      ? `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`
      : `https://api.lever.co/v0/postings/${board}?mode=json`;
  const r = await fetcher(endpoint, {
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
    redirect: "error",
  });
  if (!r.ok) throw new Error(`Source returned HTTP ${r.status}`);
  const raw = await r.text();
  if (raw.length > 8_000_000)
    throw new Error("Source response exceeds size limit.");
  const data = JSON.parse(raw),
    list = source.type === "greenhouse" ? data.jobs : data;
  if (!Array.isArray(list))
    throw new Error("Source did not return a job list.");
  return list
    .slice(0, 1500)
    .map((j) => {
      const location = clean(j.location?.name || j.categories?.location),
        description = clean(
          j.content ||
            [
              j.descriptionPlain,
              ...(j.lists || []).map((x) => `${x.text} ${x.content}`),
              j.additionalPlain,
            ].join(" "),
      ).slice(0, 12000);
      // Never guess a country or remote eligibility from an employer's headquarters.
      const arrangement =
        j.workplaceType === "remote" || /\bremote\b/i.test(location)
          ? "remote"
          : j.workplaceType === "hybrid" || /\bhybrid\b/i.test(location)
            ? "hybrid"
            : j.workplaceType === "on-site"
              ? "onsite"
              : "unknown";
      return {
        id: `${source.type}:${source.board}:${j.id}`,
        sourceId: source.id,
        externalId: String(j.id),
        title: clean(j.title || j.text),
        company: source.company,
        description,
        location,
        arrangement,
        country: "",
        city: "",
        countries: [],
        category: category(
          `${j.title || j.text} ${j.departments?.map((d) => d.name).join(" ") || j.categories?.team || ""}`,
        ),
        url: safeUrl(j.absolute_url || j.hostedUrl),
        applyUrl: safeUrl(j.applyUrl || j.absolute_url),
        postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
        updatedAt: j.updated_at || null,
        discoveredAt: now(),
        eligibilityConfirmed: null,
        salaryMonthlyUsd: null,
        closed: false,
      };
    })
    .filter((j) => j.url && j.title);
}
export async function discover(s, fetcher = fetch) {
  const enabled = s.sources.filter((x) => x.enabled),
    results = await Promise.allSettled(
      enabled.map((x) => readSource(x, fetcher)),
    );
  let added = 0;
  for (let i = 0; i < results.length; i++) {
    const source = enabled[i],
      result = results[i];
    source.checkedAt = now();
    if (result.status === "rejected") {
      source.error = result.reason.message;
      event(s, "source-error", `${source.company}: ${source.error}`);
      continue;
    }
    source.error = null;
    const ids = new Set(result.value.map((j) => j.id));
    for (const old of s.jobs.filter((j) => j.sourceId === source.id))
      old.closed = !ids.has(old.id);
    for (const job of result.value) {
      const old = s.jobs.find((j) => j.id === job.id);
      if (old) {
        const changed =
          old.description !== job.description || old.title !== job.title;
        Object.assign(old, {
          title: job.title,
          description: job.description,
          url: job.url,
          applyUrl: job.applyUrl,
          closed: false,
          lastSeenAt: now(),
        });
        if (changed) {
          old.eligibilityConfirmed = null;
          for (const a of s.applications.filter(
            (a) => a.jobId === old.id && !a.submittedAt,
          )) {
            a.approval = null;
            if (a.status === "approved") a.status = "draft";
          }
        }
      } else {
        s.jobs.push(job);
        added++;
      }
    }
    source.count = result.value.length;
  }
  s.lastRun = now();
  event(
    s,
    "discovery",
    `Discovered ${added} new opportunities across ${enabled.length} sources.`,
  );
  if (added)
    notify(
      s,
      `${added} new opportunities are ready to explore.`,
      `discovery:${s.lastRun}`,
    );
  return {
    added,
    sources: enabled.length,
    errors: results.filter((x) => x.status === "rejected").length,
  };
}
