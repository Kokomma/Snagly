"use client";
import { useState } from "react";
export default function ServiceSettings({ state, setup, act, busy }) {
  const [consent, setConsent] = useState(!!state.ai?.enabled),
    [error, setError] = useState("");
  async function email(action, provider) {
    setError("");
    try {
      const r = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, provider }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (d.url) window.location.assign(d.url);
      else window.location.reload();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div className="settings-grid service-settings">
      <section className="panel form-panel">
        <div className="section-title">
          <h2>✦ AI career assistant</h2>
          <span className="badge">Free only</span>
        </div>
        <p>
          Tailor a CV and cover letter to each role using your saved career
          evidence. The draft also includes an explanation of your fit, gaps and
          a networking message.
        </p>
        <p className="notice">
          {setup.ai
            ? "AI tailoring is available. Enable it below to create personalized drafts."
            : "AI tailoring is temporarily unavailable. You can still prepare and edit a draft."}
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />{" "}
          I agree to send my career evidence and vacancy details to Gemini for
          drafting. Free-tier content may be used to improve Google products. I
          will review generated claims.
        </label>
        <p className="muted">
          No paid model fallback. When the free quota is exhausted, requests
          wait and retry on an hourly run after the cooldown. Free allowance is
          shared by this app’s users.
        </p>
        <div className="button-row">
          <button
            className="primary"
            disabled={busy || !consent}
            onClick={() =>
              act(
                { action: "ai-settings", enabled: true, consent },
                "AI tailoring enabled",
              )
            }
          >
            Enable AI tailoring
          </button>
          <button
            disabled={busy}
            onClick={() =>
              act(
                { action: "ai-settings", enabled: false, consent: false },
                "AI tailoring paused",
              )
            }
          >
            Pause AI
          </button>
        </div>
        <p>
          Status: <b>{state.ai?.enabled ? "Enabled" : "Paused"}</b> ·{" "}
          {state.ai?.used || 0} requests today
        </p>
        {state.ai?.lastSuccessAt && (
          <p>
            Last successful draft:{" "}
            {new Date(state.ai.lastSuccessAt).toLocaleString()}
          </p>
        )}
        {state.ai?.error && <p className="notice">{state.ai.error}</p>}
        {state.ai?.queue?.length > 0 && (
          <p>
            {state.ai.queue.length} drafts waiting
            {state.ai.nextAttemptAt
              ? " · next eligible retry " +
                new Date(state.ai.nextAttemptAt).toLocaleString()
              : ""}
            .
          </p>
        )}
      </section>
      <section className="panel form-panel">
        <h2>Your email connections</h2>
        <p>
          Connect your own Gmail or Outlook account. Applications use your
          mailbox only after you enable sending and approve the exact package.
          Mailbox passwords are never requested.
        </p>
        {["gmail", "outlook"].map((provider) => (
          <div className="source-row" key={provider}>
            <div>
              <b>
                {provider === "gmail"
                  ? "Gmail"
                  : "Microsoft Outlook / Microsoft 365"}
              </b>
              <small>
                {state.emailConnection?.provider === provider
                  ? state.emailConnection.email
                  : setup.emailProviders?.[provider]
                    ? "Ready to connect"
                    : "Connection coming soon"}
              </small>
            </div>
            <button
              type="button"
              disabled={busy || !setup.emailProviders?.[provider]}
              onClick={() => email("connect", provider)}
            >
              Connect
            </button>
          </div>
        ))}
        {state.emailConnection && (
          <button
            onClick={() => email("disconnect", state.emailConnection.provider)}
          >
            Disconnect mailbox & pause sending
          </button>
        )}
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        <p className="muted">
          An employer’s hosted form may require a CAPTCHA, legal consent or a
          new question. Those applications stay ready for review; Snagly does
          not invent answers. All sent applications keep the exact saved CV,
          letter, recipient and provider receipt in the tracker.
        </p>
      </section>
    </div>
  );
}
