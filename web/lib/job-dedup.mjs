// Only merge provable identities, never title/company guesses.
export function vacancyKey(job) {
  try {
    const u = new URL(job.employerApplyUrl || job.applyUrl || job.url);
    if (u.protocol !== "https:" || u.username || u.password) return "";
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|source$|ref$|referrer$|gh_src$|lever-source$)/i.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    u.pathname = u.pathname.replace(/\/application\/?$/, "").replace(/\/+$/, "");
    return u.href;
  } catch { return ""; }
}
export function mergeDuplicateJobs(state) {
  const groups = new Map();
  const counts = new Map();
  for (const a of state.applications || []) counts.set(a.jobId, (counts.get(a.jobId) || 0) + 1);
  // Prefer a record already referenced by an application.
  for (const j of [...state.jobs].sort((a,b) => (counts.get(b.id)||0)-(counts.get(a.id)||0))) {
    const key = vacancyKey(j);
    const existing = key && groups.get(key);
    if (!existing) { if (key) groups.set(key,j); continue; }
    existing.sourceRefs = [...new Map([...(existing.sourceRefs || [{id:existing.id,sourceId:existing.sourceId,url:existing.url}]), ...(j.sourceRefs || [{id:j.id,sourceId:j.sourceId,url:j.url}])].map(x=>[x.id,x])).values()];
    existing.closed = !!existing.closed && !!j.closed;
    for (const a of state.applications || []) if (a.jobId === j.id) {
      a.jobId = existing.id;
      if (!a.submittedAt) { a.approval = null; if (a.status === "approved") a.status = "draft"; }
    }
    state.jobs = state.jobs.filter(x=>x.id !== j.id);
  }
}
