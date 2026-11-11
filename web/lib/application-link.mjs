import { researchSourceFor } from "./research-sources.mjs";
export function applicationLink(job) {
  const url = job.employerApplyUrl || job.applyUrl || job.url;
  const research = researchSourceFor(url);
  return { url, research, label: research ? `Open ${research} listing` : "Apply on employer website" };
}
