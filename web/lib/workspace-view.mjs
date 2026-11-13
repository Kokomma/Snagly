import { analyze, autoBlockers } from "./model.mjs";
export function jobSummary(j, state) {
  const out = {...j, match:analyze(j,state.profile,state.preferences)};
  for (const k of ["description","_body","_skillMatches","_skillProfile","_category"]) delete out[k];
  return out;
}
export function applicationSummary(a, state) {
  const out = {...a, blockers:autoBlockers(state,a)};
  for (const k of ["resume","letter","ai","method","_body","_packageHash","_hasAI"]) delete out[k];
  return out;
}
export function workspaceSummary(state) {
  const all = state.jobs.map(j=>jobSummary(j,state));
  const featured = all.filter(j=>!j.closed).sort((a,b)=>b.match.score-a.match.score).slice(0,8);
  const ids = new Set([...featured.map(j=>j.id),...state.applications.map(a=>a.jobId)]);
  const since = days => state.jobs.filter(j=>Date.parse(j.discoveredAt) >= Date.now()-days*86400000).length;
  return {...state, jobs:all.filter(j=>ids.has(j.id)), applications:state.applications.map(a=>applicationSummary(a,state)),
    jobStats:{active:all.filter(j=>!j.closed).length,discovered:{1:since(1),7:since(7),30:since(30)}}};
}
export function jobPage(state, params) {
  const page = Math.min(1000,Math.max(1,parseInt(params.get("page"),10)||1));
  const query = (params.get("query")||"").slice(0,200).toLowerCase();
  const cat=params.get("category")||"All", arr=params.get("arrangement")||"all", personalized=params.get("personalized")!=="false";
  const all=state.jobs.filter(j=>!j.closed).map(j=>jobSummary(j,state)).filter(j=>
    (!personalized || ((j.match.score>0 || state.profile.categories.includes(j.match.category)) && j.match.location!=="excluded")) &&
    (cat==="All" || j.match.category===cat) && (arr==="all" || j.arrangement===arr) &&
    (!query || `${j.title} ${j.company} ${j.location} ${j.match.matched.join(" ")}`.toLowerCase().includes(query))
  ).sort((a,b)=>params.get("sort")==="newest" ? Date.parse(b.discoveredAt)-Date.parse(a.discoveredAt) : b.match.score-a.match.score || a.id.localeCompare(b.id));
  return {jobs:all.slice((page-1)*60,page*60),total:all.length,page,pageSize:60,revision:state.revision};
}
