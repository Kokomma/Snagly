import { uid } from "./model.mjs";
export function boardFromUrl(value) {
  if (/\/(?:\.|%2e){1,2}(?:\/|$)/i.test(value))
    throw new Error("Use the original career-board link.");
  let u;
  try {
    u = new URL(value);
  } catch {
    throw new Error(
      "Paste the full career-board link, beginning with https://.",
    );
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port)
    throw new Error("Use a public HTTPS career-board link.");
  const host = u.hostname.toLowerCase(),
    parts = u.pathname.split("/").filter(Boolean);
  if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".localhost") || host.endsWith(".internal") || host.includes(":") || /^[\d.]+$/.test(host))
    throw new Error("Use a public job-board website, not a local or IP address.");
  if (host === "jobs.workable.com")
    return { type: "research", board: "workable", company: "Jobs by Workable", url: u.href, note: "Browse Workable and import an individual vacancy with its description. This general search portal does not provide a connected company feed." };
  if (["hiringcafe.com", "www.hiringcafe.com", "hiring.cafe", "www.hiring.cafe"].includes(host))
    return {
      type: "hiringcafe",
      board: "hiringcafe",
      company: "HiringCafe",
      query: "",
    };
  const providers = {
    "boards.greenhouse.io": "greenhouse",
    "job-boards.greenhouse.io": "greenhouse",
    "jobs.lever.co": "lever",
    "jobs.eu.lever.co": "lever",
    "jobs.ashbyhq.com": "ashby",
    "apply.workable.com": "workable",
    "jobs.smartrecruiters.com": "smartrecruiters",
    "careers.smartrecruiters.com": "smartrecruiters",
  };
  let type = providers[host],
    board = parts[0];
  if (host === "boards.greenhouse.io" && parts[0] === "embed")
    board = u.searchParams.get("for");
  if (!type || !board || !/^[a-zA-Z0-9_-]{1,100}$/.test(board))
    return { type: "research", board: u.href, company: host.replace(/^www\./, ""), url: u.href, note: "Link saved. Automatic importing is not available for this page yet. Browse it and import vacancies into your tracker with their descriptions. Company pages on supported platforms can connect an automatic feed." };
  return { type, board, company: board.replace(/[-_]/g, " "), url: u.href };
}
export function profileSearch(profile, preferences) {
  const places = ["remote", "hybrid", "onsite"]
    .filter((k) => preferences[k]?.enabled)
    .map(
      (k) =>
        `${k}: ${preferences[k].country || profile.country || "any country"}${preferences[k].cities ? "; cities " + preferences[k].cities : ""}`,
    );
  return `Find current jobs matching these skills: ${profile.skills || "general professional roles"}. Interests: ${(profile.categories || []).join(", ") || "all career categories"}. ${profile.passions || ""}. Locations: ${places.join(" | ")}. Residence: ${profile.country || "unspecified"}. Include diverse employers, especially Greenhouse, Lever and Ashby postings. Do not assume remote means worldwide.`.slice(
    0,
    2000,
  );
}
const starters = [
  ["greenhouse", "canonical", "Canonical"],
  ["greenhouse", "gitlab", "GitLab"],
  ["lever", "palantir", "Palantir"],
  ["lever", "binance", "Binance"],
  ["ashby", "ramp", "Ramp"],
  ["ashby", "linear", "Linear"],
];
export function ensureDiscoverySources(s) {
  if (!s.profile.skills && !s.profile.careerHistory) return;
  if (!s.discoveryInitialized) {
    for (const [type, board, company] of starters)
      if (!s.sources.some((x) => x.type === type && x.board === board))
        s.sources.push({
          id: uid(),
          type,
          board,
          company,
          enabled: true,
          starter: true,
        });
    s.discoveryInitialized = true;
  }
  let hc = s.sources.find((x) => x.type === "hiringcafe");
  if (!hc) {
    hc = {
      id: uid(),
      type: "hiringcafe",
      board: "hiringcafe",
      company: "HiringCafe",
      enabled: true,
      automaticQuery: true,
    };
    s.sources.push(hc);
  }
  if (hc.automaticQuery || !hc.query) {
    hc.query = profileSearch(s.profile, s.preferences);
    hc.automaticQuery = true;
  }
}
