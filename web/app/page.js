"use client";
import { useEffect, useState } from "react";
import { researchSources } from "../lib/research-sources.mjs";
const CATEGORIES = [
  "Finance & Accounting",
  "Data & Analytics",
  "Operations",
  "Product & Technology",
  "Sales & Marketing",
  "People & Support",
  "Other",
];
const NAV = [
  ["Overview", "◈"],
  ["Discover jobs", "⌕"],
  ["Applications", "▤"],
  ["CV Studio", "▧"],
  ["Snagly Intel", "◎"],
  ["Career profile", "♧"],
  ["Sources & settings", "⚙"],
];
const date = (v) =>
  v
    ? new Date(v).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Not yet";
const list = (v) =>
  String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const download = (name, text) => {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};
function Mark() {
  return (
    <svg width="33" height="34" viewBox="0 0 100 90" aria-hidden="true">
      <path fill="#6ab0ff" d="M5 10h90L85 27H15z" />
      <path fill="#2a8fff" d="M15 29h70L76 45H24z" />
      <path fill="#2ed3e6" d="M25 47h50L66 61H34z" />
      <path fill="#16c784" d="M35 63h30L50 84z" />
    </svg>
  );
}
function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">↗</div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
function Badge({ children, tone = "" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function JobCard({ job, onClick }) {
  return (
    <button className="job-card" onClick={onClick}>
      <div className="job-top">
        <span className="company-icon">
          {job.company.slice(0, 2).toUpperCase()}
        </span>
        <span className="company-name">
          {job.company}
          <small>{job.category || job.match.category}</small>
        </span>
        <span className="score">
          {job.match.score}%<small>skill match</small>
        </span>
      </div>
      <h3>{job.title}</h3>
      <p>{job.location || "Location needs review"}</p>
      <div className="job-bottom">
        <Badge>
          {job.arrangement === "unknown"
            ? "Arrangement to review"
            : job.arrangement}
        </Badge>
        <Badge tone={job.match.eligibility === "confirmed" ? "green" : "amber"}>
          {job.match.eligibility === "confirmed"
            ? "Eligibility confirmed"
            : "Eligibility to review"}
        </Badge>
      </div>
      <footer>
        Found {date(job.discoveredAt)}
        <span>View opportunity ↗</span>
      </footer>
    </button>
  );
}
export default function Home() {
  const [state, setState] = useState(null),
    [setup, setSetup] = useState(null),
    [login, setLogin] = useState(false),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [view, setView] = useState("Overview"),
    [selected, setSelected] = useState(null),
    [notifications, setNotifications] = useState(false),
    [dark, setDark] = useState(false),
    [range, setRange] = useState(1),
    [cat, setCat] = useState("All"),
    [arr, setArr] = useState("all"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("newest"),
    [importing, setImporting] = useState(false),
    [track, setTrack] = useState("all");
  async function load() {
    try {
      const r = await fetch("/api/workspace", { cache: "no-store" }),
        d = await r.json();
      setSetup(d.setup);
      if (r.status === 401) {
        setLogin(true);
        return;
      }
      if (!r.ok) throw new Error(d.error);
      setState(d.state);
      setLogin(false);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    setDark(localStorage.getItem("snagly-theme") === "dark");
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  async function act(body, message = "Saved") {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, revision: state.revision }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load();
      setToast(message);
      setTimeout(() => setToast(""), 4000);
      return true;
    } catch (e) {
      setError(e.message);
      await load();
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function signIn(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setPassword("");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const navigate = (v) => {
    setView(v);
    setSelected(null);
    setError("");
  };
  if (!state)
    return (
      <main className="login">
        <div className="login-card">
          <div className="brand">
            <Mark />
            snagly<span>personal</span>
          </div>
          <span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
          <h1>
            A little momentum.
            <br />A lot of possibility.
          </h1>
          <p>
            Your private workspace for discovering opportunities and making your
            next career move.
          </p>
          {setup?.auth === false ? (
            <div className="notice">
              <h3>Let’s set up your workspace</h3>
              <p>
                Configure an owner password of at least 16 characters and a
                session secret of at least 32 characters. Hosted use also
                requires a database. See the setup guide in the repository.
              </p>
            </div>
          ) : login ? (
            <form onSubmit={signIn}>
              <Field label="Owner password">
                <input
                  autoFocus
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>
              <button className="primary" disabled={busy}>
                Open my workspace →
              </button>
            </form>
          ) : (
            <p>Opening your workspace…</p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <small>
            Personal MVP · Your applications always start with your permission.
          </small>
        </div>
      </main>
    );
  const activeJobs = state.jobs.filter((j) => !j.closed),
    pending = state.applications.filter((a) =>
      ["draft", "approved", "manual"].includes(a.status),
    ),
    due = state.applications.filter(
      (a) =>
        a.followUpAt &&
        new Date(a.followUpAt) <= new Date() &&
        a.status === "submitted",
    );
  const cutoff = Date.now() - range * 86400000,
    activity = state.activity.filter((e) => Date.parse(e.at) >= cutoff),
    discoveries = state.jobs.filter(
      (j) => Date.parse(j.discoveredAt) >= cutoff,
    ),
    submitted = state.applications.filter(
      (a) => a.submittedAt && Date.parse(a.submittedAt) >= cutoff,
    ),
    prepared = activity.filter((e) => e.type === "prepared");
  const jobs = activeJobs
    .filter(
      (j) =>
        (cat === "All" || j.match.category === cat) &&
        (arr === "all" || j.arrangement === arr) &&
        (!query ||
          `${j.title} ${j.company} ${j.description}`
            .toLowerCase()
            .includes(query.toLowerCase())),
    )
    .sort((a, b) =>
      sort === "match"
        ? b.match.score - a.match.score
        : Date.parse(b.discoveredAt) - Date.parse(a.discoveredAt),
    );
  const selectedJob = state.jobs.find((j) => j.id === selected),
    selectedApp = state.applications.find((a) => a.jobId === selected);
  return (
    <div className="shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("Overview")}>
          <Mark />
          snagly
        </button>
        <div className="workspace-label">PERSONAL WORKSPACE</div>
        <nav>
          {NAV.map(([label, icon]) => (
            <button
              key={label}
              className={view === label ? "active" : ""}
              onClick={() => navigate(label)}
            >
              <span>{icon}</span>
              {label}
              {label === "Applications" && pending.length > 0 && (
                <b>{pending.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="pulse" />
          <b>Built around you</b>
          <p>
            Your experience.
            <br />
            Your ambitions. Your next move.
          </p>
        </div>
        <button className="owner" onClick={() => navigate("Career profile")}>
          <span className="avatar">
            {state.profile.name?.slice(0, 1) || "Y"}
          </span>
          <span>
            {state.profile.name || "Your workspace"}
            <small>Personal account</small>
          </span>
          <span>↗</span>
        </button>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div className="breadcrumbs">
            My workspace <span>/</span> <b>{view}</b>
          </div>
          <div className="top-actions">
            <button
              className="icon-btn"
              title="Toggle color theme"
              aria-label="Toggle color theme"
              onClick={() => {
                setDark(!dark);
                localStorage.setItem("snagly-theme", !dark ? "dark" : "light");
              }}
            >
              {dark ? "☀" : "☾"}
            </button>
            <button
              className="icon-btn bell"
              aria-label="Notifications"
              onClick={() => setNotifications(!notifications)}
            >
              ♧{state.notifications.some((n) => !n.read) && <i />}
            </button>
            <span className="top-divider" />
            <span className="avatar small">
              {state.profile.name?.slice(0, 1) || "Y"}
            </span>
          </div>
        </header>
        <main className="content" aria-busy={busy}>
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}
          {toast && (
            <div className="toast" role="status">
              ✓ {toast}
            </div>
          )}
          {!setup.database && (
            <div className="notice compact">
              Local workspace · Data is saved on this computer. Connect a
              database before deploying.
            </div>
          )}
          {notifications && (
            <section className="panel notification-panel">
              <div className="section-title">
                <h2>Notifications</h2>
                <button onClick={() => act({ action: "read-notifications" })}>
                  Mark all read
                </button>
              </div>
              {state.notifications.length ? (
                state.notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`notification ${n.read ? "" : "unread"}`}
                  >
                    <p>{n.message}</p>
                    <small>{date(n.at)}</small>
                  </div>
                ))
              ) : (
                <p className="muted">
                  Notifications will appear as your workspace makes progress.
                </p>
              )}
            </section>
          )}
          {selectedJob ? (
            <JobDetail
              key={`${selectedJob.id}:${state.revision}`}
              job={selectedJob}
              application={selectedApp}
              act={act}
              busy={busy}
              close={() => setSelected(null)}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {view === "Overview"
                      ? "MAKE ROOM FOR WHAT’S NEXT"
                      : "YOUR CAREER, IN MOTION"}
                  </span>
                  <h1>
                    {view === "Overview"
                      ? `Hello${state.profile.name ? ", " + state.profile.name.split(" ")[0] : ", future you"}.`
                      : view}
                  </h1>
                  <p>
                    {
                      {
                        Overview:
                          "Small steps today. Bigger possibilities tomorrow.",
                        "Discover jobs":
                          "A wider view of where your experience can take you.",
                        Applications:
                          "Every opportunity, every next step, in one place.",
                        "CV Studio":
                          "Your story, tailored to the opportunity. Always truthful.",
                        "Snagly Intel":
                          "Start thoughtful conversations. Build real connections.",
                        "Career profile":
                          "The experience and preferences behind your next move.",
                        "Sources & settings":
                          "Give your career assistant clear places to look and rules to follow.",
                      }[view]
                    }
                  </p>
                </div>
                {view === "Overview" || view === "Discover jobs" ? (
                  <button
                    className="primary"
                    disabled={busy || !state.sources.some((s) => s.enabled)}
                    onClick={() =>
                      act({ action: "discover" }, "Discovery complete")
                    }
                  >
                    {busy ? "Working…" : "↻  Discover now"}
                  </button>
                ) : null}
              </div>
              {view === "Overview" && (
                <>
                  <section className="hero">
                    <div>
                      <Badge tone="light">YOUR CAREER ASSISTANT</Badge>
                      <h2>
                        Your next chapter.
                        <br />
                        Already in progress.
                      </h2>
                      <p>
                        Discover across your interests. Prepare with confidence.
                        <br />
                        Move forward on your terms.
                      </p>
                      <button
                        onClick={() =>
                          navigate(
                            state.profile.careerHistory
                              ? "Discover jobs"
                              : "Career profile",
                          )
                        }
                      >
                        {state.profile.careerHistory
                          ? "Explore opportunities"
                          : "Build my career profile"}{" "}
                        <span>↗</span>
                      </button>
                    </div>
                    <div className="hero-art" aria-hidden="true">
                      <div className="orbit o1" />
                      <div className="orbit o2" />
                      <div className="art-card ac1">
                        ✦ <span>A world of possibilities</span>
                      </div>
                      <div className="art-card ac2">
                        ↗ <span>Your next move</span>
                      </div>
                      <div className="big-star">✳</div>
                    </div>
                  </section>
                  <div className="section-title activity-heading">
                    <h2>Your activity at a glance</h2>
                    <select
                      aria-label="Activity date range"
                      value={range}
                      onChange={(e) => setRange(Number(e.target.value))}
                    >
                      <option value={1}>Last 24 hours</option>
                      <option value={7}>Last 7 days</option>
                      <option value={30}>Last 30 days</option>
                    </select>
                  </div>
                  <div className="stats">
                    {[
                      [
                        discoveries.length,
                        "Opportunities discovered",
                        "⌕",
                        "blue",
                      ],
                      [prepared.length, "Applications prepared", "▧", "purple"],
                      [
                        submitted.length,
                        "Applications submitted",
                        "↗",
                        "green",
                      ],
                      [due.length, "Follow-ups due now", "◷", "orange"],
                    ].map(([n, label, icon, color]) => (
                      <div className="stat" key={label}>
                        <span className={`stat-icon ${color}`}>{icon}</span>
                        <strong>{n}</strong>
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                  <section className="mode-bar">
                    <div className="mode-icon">◈</div>
                    <div>
                      <b>
                        You’re in{" "}
                        {state.preferences.mode === "review"
                          ? "Review & Approve"
                          : "Auto Apply"}{" "}
                        mode
                      </b>
                      <p>
                        {state.preferences.mode === "review"
                          ? "Applications are prepared for you. You decide what goes out."
                          : "Only exact preapproved email packages can be sent. All permission checks still apply."}
                      </p>
                    </div>
                    <button onClick={() => navigate("Sources & settings")}>
                      Manage mode ↗
                    </button>
                  </section>
                  {!state.profile.careerHistory || !state.sources.length ? (
                    <section className="panel onboarding">
                      <div>
                        <span className="eyebrow">A STRONG START</span>
                        <h2>Let’s get your momentum going.</h2>
                        <p>
                          Two small steps give Snagly the context to work for
                          you.
                        </p>
                      </div>
                      <button onClick={() => navigate("Career profile")}>
                        <span
                          className={
                            state.profile.careerHistory ? "step done" : "step"
                          }
                        >
                          {state.profile.careerHistory ? "✓" : "1"}
                        </span>
                        <span>
                          <b>Add your career story</b>
                          <small>
                            Your skills, experience and work preferences
                          </small>
                        </span>
                        ↗
                      </button>
                      <button onClick={() => navigate("Sources & settings")}>
                        <span
                          className={
                            state.sources.length ? "step done" : "step"
                          }
                        >
                          {state.sources.length ? "✓" : "2"}
                        </span>
                        <span>
                          <b>Connect company career boards</b>
                          <small>Choose the employers you want to follow</small>
                        </span>
                        ↗
                      </button>
                    </section>
                  ) : null}
                  <div className="dashboard-grid">
                    <section>
                      <div className="section-title">
                        <h2>
                          Opportunities for you{" "}
                          <span className="count">{activeJobs.length}</span>
                        </h2>
                        <button onClick={() => navigate("Discover jobs")}>
                          View all ↗
                        </button>
                      </div>
                      {activeJobs.length ? (
                        <div className="job-grid">
                          {[...activeJobs]
                            .sort((a, b) => b.match.score - a.match.score)
                            .slice(0, 2)
                            .map((j) => (
                              <JobCard
                                key={j.id}
                                job={j}
                                onClick={() => setSelected(j.id)}
                              />
                            ))}
                        </div>
                      ) : (
                        <Empty
                          title="Possibility is on the horizon"
                          action={
                            <button
                              onClick={() => navigate("Sources & settings")}
                            >
                              Add a career board →
                            </button>
                          }
                        >
                          Connect a company career board to discover real jobs.
                          Your results will appear here.
                        </Empty>
                      )}
                    </section>
                    <section>
                      <div className="section-title">
                        <h2>Recent activity</h2>
                        <span className="live-dot">LIVE WORKSPACE</span>
                      </div>
                      <div className="panel timeline">
                        {activity.length ? (
                          activity.slice(0, 6).map((e) => (
                            <div key={e.id}>
                              <span className="timeline-dot" />
                              <div>
                                <p>{e.message}</p>
                                <small>{date(e.at)}</small>
                              </div>
                              {e.jobId && (
                                <button
                                  aria-label="View job"
                                  onClick={() => setSelected(e.jobId)}
                                >
                                  ↗
                                </button>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="muted">
                            Your progress will appear here, with real timestamps
                            and source records.
                          </p>
                        )}
                      </div>
                    </section>
                  </div>
                  <div className="footer-note">
                    ✧ A career is a journey. You don’t have to do it all today.
                    <span>Last discovery: {date(state.lastRun)}</span>
                  </div>
                </>
              )}
              {view === "Discover jobs" && (
                <>
                  <section className="panel">
                    <div className="section-title">
                      <h2>More places to find your next move</h2>
                      <Badge>Browse & import</Badge>
                    </div>
                    <div className="research-grid">
                      {researchSources.map((source) => (
                        <article className="research-card" key={source.name}>
                          <h3>
                            {source.name} <span>↗</span>
                          </h3>
                          <p>{source.description}</p>
                          <small>{source.note}</small>
                          <div className="button-row">
                            <a
                              className="button"
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Browse {source.name} ↗
                            </a>
                            <button onClick={() => setImporting(true)}>
                              Import a job
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  <div className="filter-bar">
                    <input
                      placeholder="Search roles, companies or skills…"
                      aria-label="Search jobs"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <select
                      aria-label="Work arrangement"
                      value={arr}
                      onChange={(e) => setArr(e.target.value)}
                    >
                      <option value="all">All arrangements</option>
                      {["remote", "hybrid", "onsite", "unknown"].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                    <select
                      aria-label="Sort opportunities"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="newest">Newest first</option>
                      <option value="match">Best skill match</option>
                    </select>
                    <button onClick={() => setImporting(!importing)}>
                      ＋ Add job
                    </button>
                  </div>
                  <div className="tabs categories">
                    {["All", ...CATEGORIES].map((c) => (
                      <button
                        className={cat === c ? "selected" : ""}
                        key={c}
                        onClick={() => setCat(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <p className="muted small-text">
                    Scores show overlap with your declared skills, not your
                    chance of being hired. Employer eligibility needs separate
                    review.
                  </p>
                  {importing && (
                    <ImportJob act={act} close={() => setImporting(false)} />
                  )}
                  <div className="job-grid discover-grid">
                    {jobs.map((j) => (
                      <JobCard
                        key={j.id}
                        job={j}
                        onClick={() => setSelected(j.id)}
                      />
                    ))}
                  </div>
                  {!jobs.length && (
                    <Empty title="Your search has room to grow">
                      Add career boards in Sources & settings, import a vacancy,
                      or adjust your filters.
                    </Empty>
                  )}
                </>
              )}
              {(view === "Applications" || view === "CV Studio") && (
                <>
                  <div className="tabs">
                    {[
                      "all",
                      "draft",
                      "approved",
                      "manual",
                      "submitted",
                      "interview",
                      "offer",
                      "rejected",
                      "skipped",
                      "uncertain",
                    ].map((t) => (
                      <button
                        key={t}
                        className={track === t ? "selected" : ""}
                        onClick={() => setTrack(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <section className="panel">
                    <div className="section-title">
                      <h2>
                        {view === "CV Studio"
                          ? "Your application packages"
                          : "Application tracker"}
                      </h2>
                      <button
                        onClick={() =>
                          download(
                            "snagly-tracker.csv",
                            "Title,Company,Status,Submitted,Follow-up\n" +
                              state.applications
                                .map((a) => {
                                  const j = state.jobs.find(
                                    (j) => j.id === a.jobId,
                                  );
                                  return [
                                    j?.title,
                                    j?.company,
                                    a.status,
                                    a.submittedAt,
                                    a.followUpAt,
                                  ]
                                    .map(
                                      (v) =>
                                        '"' +
                                        String(v || "").replaceAll('"', '""') +
                                        '"',
                                    )
                                    .join(",");
                                })
                                .join("\n"),
                          )
                        }
                      >
                        Export tracker ↓
                      </button>
                    </div>
                    {state.applications
                      .filter((a) => track === "all" || a.status === track)
                      .map((a) => {
                        const j = state.jobs.find((j) => j.id === a.jobId);
                        return (
                          <button
                            className="application-row"
                            key={a.id}
                            onClick={() => setSelected(a.jobId)}
                          >
                            <span className="company-icon">
                              {j?.company.slice(0, 2)}
                            </span>
                            <span>
                              <b>{j?.title}</b>
                              <small>
                                {j?.company} · Prepared {date(a.createdAt)}
                              </small>
                            </span>
                            <Badge
                              tone={a.status === "submitted" ? "green" : ""}
                            >
                              {a.status}
                            </Badge>
                            <span className="muted">
                              {a.followUpAt
                                ? "Follow up " + date(a.followUpAt)
                                : "View package"}{" "}
                              ↗
                            </span>
                          </button>
                        );
                      })}
                    {!state.applications.length && (
                      <Empty
                        title="Your next application starts here"
                        action={
                          <button onClick={() => navigate("Discover jobs")}>
                            Explore jobs →
                          </button>
                        }
                      >
                        Choose an opportunity and prepare a package using your
                        saved career history.
                      </Empty>
                    )}
                  </section>
                </>
              )}
              {view === "Career profile" && (
                <Profile
                  key={state.revision}
                  profile={state.profile}
                  act={act}
                  busy={busy}
                />
              )}
              {view === "Sources & settings" && (
                <Settings
                  key={state.revision}
                  state={state}
                  setup={setup}
                  act={act}
                  busy={busy}
                />
              )}
              {view === "Snagly Intel" && <Intel state={state} />}
            </>
          )}
        </main>
        <footer className="app-footer">
          Snagly Personal <span>Made for your next move.</span>
          <button
            onClick={async () => {
              await fetch("/api/auth", { method: "DELETE" });
              setState(null);
              setLogin(true);
            }}
          >
            Sign out
          </button>
        </footer>
      </div>
      {busy && (
        <div className="working" role="status">
          Working on it…
        </div>
      )}
    </div>
  );
}
function Profile({ profile, act, busy }) {
  const [p, setP] = useState(profile),
    set = (k, v) => setP({ ...p, [k]: v });
  return (
    <form
      className="panel form-panel"
      onSubmit={(e) => {
        e.preventDefault();
        act({ action: "profile", profile: p }, "Career profile saved");
      }}
    >
      <div className="section-title">
        <h2>Your career story</h2>
        <Badge>PRIVATE TO YOU</Badge>
      </div>
      <div className="form-grid">
        <Field label="Full name">
          <input
            value={p.name}
            onChange={(e) => set("name", e.target.value)}
            required
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={p.email}
            onChange={(e) => set("email", e.target.value)}
            required
          />
        </Field>
        <Field label="Country of residence">
          <input
            placeholder="e.g. Nigeria"
            value={p.country}
            onChange={(e) => set("country", e.target.value)}
            required
          />
        </Field>
        <Field label="Home city">
          <input
            value={p.cities}
            onChange={(e) => set("cities", e.target.value)}
          />
        </Field>
        <Field
          label="Countries where you have work authorization"
          hint="Comma-separated. Employer-specific eligibility still needs review."
        >
          <input
            placeholder="e.g. Nigeria"
            value={p.authorizedCountries}
            onChange={(e) => set("authorizedCountries", e.target.value)}
          />
        </Field>
        <Field label="Time zone" hint="Used for daily application limits.">
          <input
            placeholder="Africa/Lagos"
            value={p.timezone}
            onChange={(e) => set("timezone", e.target.value)}
            required
          />
        </Field>
      </div>
      <Field
        label="Your skills"
        hint="Separate with commas. Match scores use these declared skills."
      >
        <textarea
          rows={3}
          value={p.skills}
          onChange={(e) => set("skills", e.target.value)}
          placeholder="Financial reporting, Excel, SQL, project management"
          required
        />
      </Field>
      <Field
        label="Career history / master CV"
        hint="Paste your verified career history, qualifications and achievements. Only include facts you can stand behind. One experience or achievement per line works well."
      >
        <textarea
          rows={12}
          value={p.careerHistory}
          onChange={(e) => set("careerHistory", e.target.value)}
          required
          placeholder="Your real experience goes here…"
        />
      </Field>
      <Field label="Or import a plain-text CV">
        <input
          type="file"
          accept=".txt,text/plain"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f && f.size <= 50000) set("careerHistory", await f.text());
            else alert("Choose a plain-text file under 50 KB.");
          }}
        />
      </Field>
      <Field
        label="Career interests"
        hint="Choose several or leave all unchecked to explore every category."
      >
        <div className="check-grid">
          {CATEGORIES.map((c) => (
            <label key={c}>
              <input
                type="checkbox"
                checked={p.categories.includes(c)}
                onChange={(e) =>
                  set(
                    "categories",
                    e.target.checked
                      ? [...p.categories, c]
                      : p.categories.filter((x) => x !== c),
                  )
                }
              />
              {c}
            </label>
          ))}
        </div>
      </Field>
      <p className="muted">
        Saving profile changes clears earlier application preapprovals. Existing
        drafts remain available for you to update.
      </p>
      <button className="primary" disabled={busy}>
        Save my profile →
      </button>
    </form>
  );
}
function Settings({ state, setup, act, busy }) {
  const [p, setP] = useState(state.preferences),
    [source, setSource] = useState({
      type: "greenhouse",
      board: "",
      company: "",
    });
  const set = (k, v) => setP({ ...p, [k]: v });
  return (
    <div className="settings-grid">
      <form
        className="panel form-panel"
        onSubmit={(e) => {
          e.preventDefault();
          act({ action: "preferences", preferences: p }, "Preferences saved");
        }}
      >
        <h2>Your application mode</h2>
        <p className="muted">
          Switch whenever you like. Pausing stops future sends; a send already
          in progress may complete.
        </p>
        <div className="mode-options">
          {[
            [
              "review",
              "Review & Approve",
              "Prepare first. Send only when you choose.",
            ],
            [
              "auto",
              "Auto Apply",
              "Send exact preapproved email packages that pass every rule.",
            ],
          ].map(([v, title, desc]) => (
            <label key={v} className={p.mode === v ? "chosen" : ""}>
              <input
                type="radio"
                name="mode"
                value={v}
                checked={p.mode === v}
                onChange={() => set("mode", v)}
              />
              <b>{title}</b>
              <small>{desc}</small>
            </label>
          ))}
        </div>
        <div className="form-grid">
          <Field label="Minimum skill match (%)">
            <input
              type="number"
              min="0"
              max="100"
              value={p.minScore}
              onChange={(e) => set("minScore", Number(e.target.value))}
            />
          </Field>
          <Field label="Maximum submissions per day">
            <input
              type="number"
              min="1"
              max="20"
              value={p.dailyLimit}
              onChange={(e) => set("dailyLimit", Number(e.target.value))}
            />
          </Field>
          <Field
            label="Minimum monthly salary (USD)"
            hint="0 means no floor. Unknown salary blocks sending when a floor is set."
          >
            <input
              type="number"
              min="0"
              value={p.minSalary}
              onChange={(e) => set("minSalary", Number(e.target.value))}
            />
          </Field>
        </div>
        <h2>Where would you like to work?</h2>
        <p className="muted">
          Set each arrangement separately. For onsite or hybrid work, leave
          country blank to use your residence country. Leave cities blank for
          anywhere in that country.
        </p>
        {["remote", "hybrid", "onsite"].map((a) => (
          <div className="location-pref" key={a}>
            <label className="check">
              <input
                type="checkbox"
                checked={p[a].enabled}
                onChange={(e) => set(a, { ...p[a], enabled: e.target.checked })}
              />
              <b>{a}</b>
            </label>
            <div className="form-grid">
              <Field
                label={
                  a === "remote"
                    ? "Preferred country or Worldwide"
                    : "Preferred country"
                }
              >
                <input
                  value={p[a].country}
                  onChange={(e) => set(a, { ...p[a], country: e.target.value })}
                />
              </Field>
              {a !== "remote" && (
                <Field label="Preferred cities (comma-separated)">
                  <input
                    placeholder="Blank = anywhere in country"
                    value={p[a].cities}
                    onChange={(e) =>
                      set(a, { ...p[a], cities: e.target.value })
                    }
                  />
                </Field>
              )}
            </div>
          </div>
        ))}
        <label className="check permission">
          <input
            type="checkbox"
            checked={p.submissionsEnabled}
            onChange={(e) => set("submissionsEnabled", e.target.checked)}
          />
          I authorize sending preapproved email applications that meet my rules.
          Each exact package and recipient must also be approved.
        </label>
        {!setup.email && (
          <p className="notice">
            Sending is unavailable until the owner configures the email provider
            and enables submissions on the server.
          </p>
        )}
        <div className="button-row">
          <button className="primary" disabled={busy}>
            Save preferences
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              act(
                {
                  action: "preferences",
                  preferences: {
                    ...state.preferences,
                    mode: "review",
                    submissionsEnabled: false,
                  },
                },
                "Automatic sending paused",
              )
            }
          >
            Pause all sending
          </button>
        </div>
      </form>
      <div>
        <section className="panel form-panel">
          <h2>Company career boards</h2>
          <p className="muted">
            Greenhouse, Lever and Ashby career boards and your HiringCafe search
            are checked hourly. HiringCafe uses one saved search per hour, with
            up to five detailed matches. No job-board login is needed.
          </p>
          {state.sources.map((s) => (
            <div key={s.id} className="source-row">
              <div>
                <b>{s.company}</b>
                <small>
                  {s.type} / {s.board} · {s.enabled ? "Active" : "Paused"}
                </small>
                <small>
                  {s.error ||
                    `${s.count ?? 0} jobs · Checked ${date(s.checkedAt)}`}
                </small>
                {s.query && <small>Search: {s.query}</small>}
                {s.warning && <small>{s.warning}</small>}
              </div>
              <button
                disabled={busy}
                onClick={() => act({ action: "toggle-source", id: s.id })}
              >
                {s.enabled ? "Pause" : "Enable"}
              </button>
            </div>
          ))}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act({ action: "source", source }, "Career board added"))
                setSource({ type: "greenhouse", board: "", company: "" });
            }}
          >
            <Field label="Company">
              <input
                value={source.company}
                onChange={(e) =>
                  setSource({ ...source, company: e.target.value })
                }
                required
              />
            </Field>
            <Field label="Source">
              <select
                value={source.type}
                onChange={(e) => {
                  const type = e.target.value;
                  setSource(
                    type === "hiringcafe"
                      ? {
                          type,
                          company: "HiringCafe search",
                          board: "hiringcafe",
                          query:
                            state.sources.find((s) => s.type === "hiringcafe")
                              ?.query || "",
                        }
                      : { type, company: "", board: "", query: "" },
                  );
                }}
              >
                <option value="greenhouse">Greenhouse</option>
                <option value="lever">Lever</option>
                <option value="ashby">Ashby</option>
                <option value="hiringcafe">HiringCafe</option>
              </select>
            </Field>
            {source.type === "hiringcafe" ? (
              <Field
                label="Your saved job search"
                hint="Only this search text is sent to HiringCafe, never your CV, contact information or application history. Describe roles, countries, cities and arrangements. One search is allowed per hour, including manual refreshes."
              >
                <textarea
                  rows={5}
                  maxLength={2000}
                  required
                  value={source.query || ""}
                  onChange={(e) =>
                    setSource({ ...source, query: e.target.value })
                  }
                  placeholder="e.g. Finance and data analyst roles in Nigeria, remote worldwide or onsite in Lagos. Prioritize newly posted jobs."
                />
              </Field>
            ) : (
              <Field
                label="Board identifier"
                hint="The company part of boards.greenhouse.io/company, jobs.lever.co/company or jobs.ashbyhq.com/company. Enter the identifier, not a URL."
              >
                <input
                  value={source.board}
                  pattern="[a-zA-Z0-9_-]+"
                  onChange={(e) =>
                    setSource({ ...source, board: e.target.value })
                  }
                  required
                />
              </Field>
            )}
            <button disabled={busy}>
              {source.type === "hiringcafe"
                ? "Save hourly HiringCafe search"
                : "＋ Add career board"}
            </button>
          </form>
        </section>
        <section className="panel form-panel setup">
          <h2>Connection status</h2>
          {[
            ["Owner sign-in", setup.auth],
            ["Cloud database", setup.database],
            ["Scheduled-run secret", setup.cron],
            ["Email submission", setup.email],
          ].map(([k, v]) => (
            <p key={k}>
              {k}
              <Badge tone={v ? "green" : "amber"}>
                {v ? "Configured" : "Setup needed"}
              </Badge>
            </p>
          ))}
          <p className="muted">
            Hourly scheduling also depends on your hosting plan. Notifications
            are delivered inside this workspace.
          </p>
        </section>
      </div>
    </div>
  );
}
function ImportJob({ act, close }) {
  const [j, setJ] = useState({
    title: "",
    company: "",
    url: "",
    description: "",
    arrangement: "unknown",
    country: "",
    city: "",
    countries: [],
    salaryMonthlyUsd: null,
  });
  return (
    <form
      className="panel form-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await act({ action: "import", job: j }, "Job imported")) close();
      }}
    >
      <h2>Add an opportunity</h2>
      <p className="muted">
        Paste the exact vacancy link and description from a job you found,
        including HiringCafe or LaborX. Employer eligibility still needs review.
        These platforms use manual application completion.
      </p>
      <div className="form-grid">
        {["title", "company", "url"].map((k) => (
          <Field key={k} label={k}>
            <input
              type={k === "url" ? "url" : "text"}
              value={j[k]}
              onChange={(e) => setJ({ ...j, [k]: e.target.value })}
              required
            />
          </Field>
        ))}
        <Field label="Arrangement">
          <select
            value={j.arrangement}
            onChange={(e) => setJ({ ...j, arrangement: e.target.value })}
          >
            {["unknown", "remote", "hybrid", "onsite"].map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Job description">
        <textarea
          rows={5}
          minLength={20}
          value={j.description}
          onChange={(e) => setJ({ ...j, description: e.target.value })}
          required
        />
      </Field>
      <div className="button-row">
        <button className="primary">Add opportunity</button>
        <button type="button" onClick={close}>
          Cancel
        </button>
      </div>
    </form>
  );
}
function Intel({ state }) {
  const [jobId, setJobId] = useState(state.jobs[0]?.id || ""),
    [person, setPerson] = useState(""),
    [context, setContext] = useState("");
  const j = state.jobs.find((j) => j.id === jobId),
    p = state.profile;
  const message = j
    ? `Hello ${person || "[Name]"},\n\nI came across the ${j.title} opportunity at ${j.company} and would value your perspective on the team.${context ? " " + context : ""}\n\n${p.skills ? "My background includes " + p.skills + ". " : ""}Would you be open to sharing what matters most for someone joining this team?\n\nThank you,\n${p.name || "[Your name]"}`
    : "";
  const [messageDraft, setMessageDraft] = useState(message);
  useEffect(() => {
    setMessageDraft(message);
  }, [message]);
  return (
    <div className="settings-grid">
      <section className="panel form-panel">
        <h2>A thoughtful introduction</h2>
        <p className="muted">
          Find a contact through the employer’s team page or a professional
          network. Snagly does not invent hiring managers or contact details.
        </p>
        <Field label="Opportunity">
          <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
            <option value="">Choose a job</option>
            {state.jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} · {j.company}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Contact name you verified">
          <input
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            placeholder="Name from a public profile"
          />
        </Field>
        <Field label="Your genuine connection or reason for reaching out">
          <textarea
            rows={3}
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
        </Field>
        {j && (
          <a
            className="button"
            target="_blank"
            rel="noreferrer"
            href={`https://www.google.com/search?q=${encodeURIComponent(`${j.company} ${j.title} hiring manager site:linkedin.com/in`)}`}
          >
            Research possible contacts ↗
          </a>
        )}
      </section>
      <section className="panel form-panel">
        <h2>Your message draft</h2>
        {message ? (
          <>
            <textarea
              aria-label="Networking message draft"
              rows={15}
              value={messageDraft}
              onChange={(e) => setMessageDraft(e.target.value)}
            />
            <button
              onClick={() => download("networking-message.txt", messageDraft)}
            >
              Download draft ↓
            </button>
            <p className="muted">
              Review the person and the facts before contacting them. Messages
              are never sent automatically.
            </p>
          </>
        ) : (
          <Empty title="Start with an opportunity">
            Choose a job to draft a personalized introduction.
          </Empty>
        )}
      </section>
    </div>
  );
}
function JobDetail({ job: j, application: a, act, busy, close }) {
  const [tab, setTab] = useState("Overview"),
    [d, setD] = useState({
      arrangement: j.arrangement,
      country: j.country,
      city: j.city,
      countries: j.countries,
      eligibilityConfirmed: j.eligibilityConfirmed,
      eligibilityNote: j.eligibilityNote || "",
      salaryMonthlyUsd: j.salaryMonthlyUsd,
    }),
    [draft, setDraft] = useState(
      a
        ? {
            resume: a.resume,
            letter: a.letter,
            subject: a.subject,
            recipient: a.recipient,
          }
        : null,
    ),
    [truth, setTruth] = useState(false),
    [recipientOk, setRecipientOk] = useState(false),
    [notes, setNotes] = useState(a?.notes || ""),
    [status, setStatus] = useState(a?.status || "saved"),
    [follow, setFollow] = useState(a?.followUpAt?.slice(0, 10) || ""),
    [receipt, setReceipt] = useState("");
  const locked =
    a &&
    [
      "submitted",
      "sending",
      "uncertain",
      "interview",
      "offer",
      "rejected",
    ].includes(a.status);
  const dirty =
    a &&
    draft &&
    ["resume", "letter", "subject", "recipient"].some(
      (key) => draft[key] !== a[key],
    );
  return (
    <>
      <button className="back" onClick={close}>
        ← Back to workspace
      </button>
      <div className="detail-heading">
        <span className="company-icon large">{j.company.slice(0, 2)}</span>
        <div>
          <span className="eyebrow">{j.company}</span>
          <h1>{j.title}</h1>
          <p>
            {j.location || "Location to review"} · {j.arrangement}
          </p>
        </div>
        <a
          className="button"
          href={j.applyUrl || j.url}
          target="_blank"
          rel="noreferrer"
        >
          Open original job ↗
        </a>
      </div>
      {j.closed && (
        <div className="notice">
          This vacancy is no longer listed by its source. Submissions are
          blocked.
        </div>
      )}
      <div className="tabs">
        {[
          "Overview",
          "Eligibility & location",
          "Application package",
          "Tracker",
        ].map((t) => (
          <button
            className={tab === t ? "selected" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Overview" && (
        <div className="settings-grid">
          <section className="panel form-panel">
            <h2>About the opportunity</h2>
            <p className="job-description">{j.description}</p>
            <small className="muted">
              Source:{" "}
              <a href={j.url} target="_blank" rel="noreferrer">
                Original posting ↗
              </a>{" "}
              · Found {date(j.discoveredAt)}
              {j.postedAt ? " · Posted " + date(j.postedAt) : ""}
            </small>
          </section>
          <section className="panel form-panel">
            <div className="match-big">
              {j.match.score}
              <span>% skill match</span>
            </div>
            <p className="muted">{j.match.basis}</p>
            <h3>Skills reflected in this role</h3>
            <div className="chip-list">
              {j.match.matched.map((s) => (
                <Badge key={s} tone="green">
                  {s}
                </Badge>
              ))}
              {!j.match.matched.length && (
                <p className="muted">No declared skill keywords matched yet.</p>
              )}
            </div>
            <h3>Your skills not mentioned</h3>
            <div className="chip-list">
              {j.match.missing.map((s) => (
                <Badge key={s}>{s}</Badge>
              ))}
            </div>
            <h3>Before you apply</h3>
            {j.match.reasons.map((r) => (
              <p className="notice compact" key={r}>
                {r}
              </p>
            ))}
            {!a ? (
              <button
                className="primary"
                disabled={busy || j.closed}
                onClick={() =>
                  act({ action: "prepare", id: j.id }, "Application prepared")
                }
              >
                Prepare application →
              </button>
            ) : (
              <button
                className="primary"
                onClick={() => setTab("Application package")}
              >
                Open application package →
              </button>
            )}
          </section>
        </div>
      )}
      {tab === "Eligibility & location" && (
        <form
          className="panel form-panel"
          onSubmit={(e) => {
            e.preventDefault();
            act(
              { action: "job", id: j.id, details: d },
              "Eligibility and location saved",
            );
          }}
        >
          <h2>Confirm against the original vacancy</h2>
          <p className="muted">
            Source locations often omit countries or remote restrictions. Fill
            these fields from the posting. This also clears any earlier package
            approval.
          </p>
          <div className="form-grid">
            <Field label="Work arrangement">
              <select
                value={d.arrangement}
                onChange={(e) => setD({ ...d, arrangement: e.target.value })}
              >
                {["unknown", "remote", "hybrid", "onsite"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Country for onsite / hybrid">
              <input
                value={d.country}
                onChange={(e) => setD({ ...d, country: e.target.value })}
              />
            </Field>
            <Field label="City for onsite / hybrid">
              <input
                value={d.city}
                onChange={(e) => setD({ ...d, city: e.target.value })}
              />
            </Field>
            <Field
              label="Confirmed remote countries"
              hint="Comma-separated country names. Use Worldwide only when the posting explicitly says so."
            >
              <input
                value={d.countries.join(", ")}
                onChange={(e) =>
                  setD({
                    ...d,
                    countries: e.target.value.split(",").map((x) => x.trim()),
                  })
                }
                onBlur={() =>
                  setD({ ...d, countries: d.countries.filter(Boolean) })
                }
              />
            </Field>
            <Field
              label="Confirmed monthly salary (USD)"
              hint="Only enter a supported amount or a conversion you have verified."
            >
              <input
                type="number"
                min="0"
                value={d.salaryMonthlyUsd ?? ""}
                onChange={(e) =>
                  setD({
                    ...d,
                    salaryMonthlyUsd:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Employer eligibility / work authorization">
              <select
                value={
                  d.eligibilityConfirmed === null
                    ? "unknown"
                    : String(d.eligibilityConfirmed)
                }
                onChange={(e) =>
                  setD({
                    ...d,
                    eligibilityConfirmed:
                      e.target.value === "unknown"
                        ? null
                        : e.target.value === "true",
                  })
                }
              >
                <option value="unknown">Needs review</option>
                <option value="true">I verified I am eligible</option>
                <option value="false">Not eligible</option>
              </select>
            </Field>
          </div>
          <Field
            label="Evidence for eligibility confirmation"
            hint="Record the employer restriction and how your authorization meets it."
          >
            <textarea
              rows={3}
              value={d.eligibilityNote}
              onChange={(e) => setD({ ...d, eligibilityNote: e.target.value })}
            />
          </Field>
          <button className="primary" disabled={busy}>
            Save review
          </button>
        </form>
      )}
      {tab === "Application package" &&
        (!a ? (
          <Empty
            title="Make this opportunity your next step"
            action={
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  act({ action: "prepare", id: j.id }, "Application prepared")
                }
              >
                Prepare application
              </button>
            }
          >
            Snagly reorders your own career history and highlights matching
            skills. It never adds experience or credentials.
          </Empty>
        ) : (
          <div>
            <section className="notice">
              <b>Grounded in your experience</b>
              <p>
                {a.method} Text-file resume export is supported. Finish ATS
                forms yourself on the employer site.
              </p>
            </section>
            <form
              className="panel form-panel"
              onSubmit={(e) => {
                e.preventDefault();
                act({ action: "draft", id: a.id, ...draft }, "Draft saved");
              }}
            >
              <div className="section-title">
                <h2>Your package</h2>
                <Badge>{a.status}</Badge>
              </div>
              <div className="form-grid">
                <Field
                  label="Application email recipient"
                  hint="Use only a verified address explicitly accepting applications for this role."
                >
                  <input
                    type="email"
                    disabled={locked}
                    value={draft.recipient}
                    onChange={(e) =>
                      setDraft({ ...draft, recipient: e.target.value })
                    }
                  />
                </Field>
                <Field label="Subject">
                  <input
                    disabled={locked}
                    value={draft.subject}
                    onChange={(e) =>
                      setDraft({ ...draft, subject: e.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="form-grid">
                <Field label="Tailored resume">
                  <textarea
                    disabled={locked}
                    rows={18}
                    value={draft.resume}
                    onChange={(e) =>
                      setDraft({ ...draft, resume: e.target.value })
                    }
                  />
                  <button
                    type="button"
                    onClick={() => download("Resume.txt", draft.resume)}
                  >
                    Download resume ↓
                  </button>
                </Field>
                <Field label="Cover letter / application email">
                  <textarea
                    disabled={locked}
                    rows={18}
                    value={draft.letter}
                    onChange={(e) =>
                      setDraft({ ...draft, letter: e.target.value })
                    }
                  />
                  <button
                    type="button"
                    onClick={() => download("Cover-letter.txt", draft.letter)}
                  >
                    Download letter ↓
                  </button>
                </Field>
              </div>
              {!locked && (
                <button className="primary" disabled={busy}>
                  Save package changes
                </button>
              )}
            </form>
            <section className="panel form-panel">
              <h2>Approval & submission</h2>
              {a.approval ? (
                <p className="notice">
                  Exact saved package preapproved until{" "}
                  {date(a.approval.expiresAt)}. Changing the profile, draft or
                  eligibility clears this approval.
                </p>
              ) : (
                <>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={truth}
                      onChange={(e) => setTruth(e.target.checked)}
                    />
                    I reviewed the saved resume and letter. All claims are
                    truthful and I authorize sending this package.
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={recipientOk}
                      onChange={(e) => setRecipientOk(e.target.checked)}
                    />
                    I verified this exact recipient accepts applications for
                    this role. Approval is valid for seven days.
                  </label>
                  <button
                    disabled={busy || locked || dirty || !truth || !recipientOk}
                    onClick={() =>
                      act(
                        {
                          action: "approve",
                          id: a.id,
                          truthConfirmed: truth,
                          recipientConfirmed: recipientOk,
                        },
                        "Exact package preapproved",
                      )
                    }
                  >
                    Preapprove saved email package
                  </button>
                </>
              )}
              {a.blockers.length > 0 && (
                <div className="blockers">
                  <b>Sending checks</b>
                  {a.blockers.map((b) => (
                    <p key={b}>· {b}</p>
                  ))}
                </div>
              )}
              {dirty && (
                <p className="notice">
                  Save your package changes before approving or sending.
                </p>
              )}
              <div className="button-row">
                <button
                  className="primary"
                  disabled={busy || dirty || a.blockers.length > 0}
                  onClick={() =>
                    act(
                      { action: "submit", id: a.id },
                      "Submission processed — check the tracker receipt",
                    )
                  }
                >
                  Send approved email now
                </button>
                {a.approval && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      act({ action: "revoke", id: a.id }, "Approval revoked")
                    }
                  >
                    Revoke approval
                  </button>
                )}
                <a
                  className="button"
                  href={j.applyUrl || j.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Complete employer form ↗
                </a>
              </div>
              {a.error && <p className="error">{a.error}</p>}
              {a.receipt && (
                <p>
                  Receipt: {a.receipt.provider} ·{" "}
                  {a.receipt.id || a.receipt.note} · {date(a.receipt.at)}
                </p>
              )}
            </section>
          </div>
        ))}
      {tab === "Tracker" &&
        (!a ? (
          <Empty title="Prepare a package to start tracking">
            Open the overview and prepare an application first.
          </Empty>
        ) : (
          <section className="panel form-panel">
            <h2>Keep the next step clear</h2>
            <p>
              Current status: <Badge>{a.status}</Badge>
            </p>
            {a.receipt && (
              <p className="notice">
                {a.receipt.provider === "self-reported"
                  ? "Manually recorded"
                  : "Email provider accepted"}{" "}
                · {a.receipt.id || a.receipt.note} · {date(a.submittedAt)}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                act({
                  action: status === a.status ? "tracker-note" : "status",
                  id: a.id,
                  status,
                  note: notes,
                  followUpAt: follow
                    ? new Date(follow + "T12:00:00Z").toISOString()
                    : "",
                });
              }}
            >
              <div className="form-grid">
                <Field label="Next status">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value={a.status}>{a.status}</option>
                    {[
                      "saved",
                      "manual",
                      "skipped",
                      "interview",
                      "offer",
                      "rejected",
                    ]
                      .filter((s) => s !== a.status)
                      .map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                  </select>
                </Field>
                <Field label="Follow-up date">
                  <input
                    type="date"
                    value={follow}
                    onChange={(e) => setFollow(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Private notes">
                <textarea
                  value={notes}
                  rows={4}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>
              <button
                disabled={
                  busy ||
                  (status !== a.status &&
                    ![
                      "saved",
                      "manual",
                      "skipped",
                      "interview",
                      "offer",
                      "rejected",
                    ].includes(status))
                }
              >
                Update tracker
              </button>
            </form>
            {!locked && (
              <form
                className="manual-record"
                onSubmit={(e) => {
                  e.preventDefault();
                  act(
                    { action: "manual-submitted", id: a.id, note: receipt },
                    "Manual submission recorded",
                  );
                }}
              >
                <h3>Applied on the employer’s website?</h3>
                <Field label="Confirmation reference or note">
                  <input
                    value={receipt}
                    onChange={(e) => setReceipt(e.target.value)}
                    placeholder="e.g. Confirmation email received today"
                    required
                  />
                </Field>
                <button disabled={busy}>
                  Record completed manual application
                </button>
              </form>
            )}
            {a.followUpAt && (
              <div className="manual-record">
                <p>Follow-up due: {date(a.followUpAt)}</p>
                <textarea
                  aria-label="Follow-up draft"
                  rows={5}
                  defaultValue={`Hello ${j.company} hiring team,\n\nI’m following up on my application for ${j.title}${a.submittedAt ? " submitted on " + new Date(a.submittedAt).toLocaleDateString() : ""}. I remain interested in the opportunity and would appreciate any update on the process. Thank you for your time.`}
                />
                <button
                  disabled={busy}
                  onClick={() =>
                    act(
                      { action: "followed-up", id: a.id },
                      "Follow-up recorded",
                    )
                  }
                >
                  I completed this follow-up
                </button>
                <small>Draft only. No follow-up is sent automatically.</small>
              </div>
            )}
          </section>
        ))}
    </>
  );
}
