"use client";
import { useState } from "react";
export default function AccountPanel({
  account,
  reload,
  onRegister,
  allowLegacyLink = false,
}) {
  const [ownerPassword, setOwnerPassword] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [showLink, setShowLink] = useState(false),
    [showVerify, setShowVerify] = useState(false);
  async function action(body) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        d = await r.json();
      if (!r.ok)
        throw new Error(
          d.error || "The account request could not be completed.",
        );
      setOwnerPassword("");
      setPassword("");
      setMessage(
        d.message || "Your original workspace is linked to this account.",
      );
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!account) return null;
  if (account.legacy)
    return (
      <section className="account-banner">
        <div>
          <b>This is your original personal workspace.</b>
          <p>
            Create an email account to keep using it with your own sign-in. You
            can link the existing data securely after registering.
          </p>
        </div>
        <button className="primary" onClick={onRegister}>
          Create my account →
        </button>
      </section>
    );
  return (
    <section className="account-panel">
      <div className="section-title">
        <div>
          <span className="eyebrow">YOUR PRIVATE ACCOUNT</span>
          <b>{account.email}</b>
        </div>
        <span className={`badge ${account.verified ? "green" : "amber"}`}>
          {account.verified ? "Email verified" : "Verify your email"}
        </span>
      </div>
      {!account.verified && (
        <>
          <p className="muted">
            Check your email for the verification link. You can complete your
            profile now; job discovery and application approval unlock after
            verification.
          </p>
          <div className="button-row">
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await reload();
                setBusy(false);
              }}
            >
              I’ve verified my email
            </button>
            <button onClick={() => setShowVerify(!showVerify)}>
              Resend verification email
            </button>
          </div>
          {showVerify && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                action({ action: "verify-email", password });
              }}
            >
              <label className="field">
                <span>Confirm your account password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button disabled={busy}>Send verification email</button>
            </form>
          )}
        </>
      )}
      {allowLegacyLink && (
        <button className="text-link" onClick={() => setShowLink(!showLink)}>
          Link an existing owner workspace
        </button>
      )}
      {allowLegacyLink && showLink && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            action({ action: "claim-legacy", ownerPassword });
          }}
        >
          <p className="muted">
            For the original owner only. Enter the original owner password to
            bring your existing profile and history into this account. Existing
            career data in this account will never be overwritten.
          </p>
          <label className="field">
            <span>Original owner password</span>
            <input
              type="password"
              autoComplete="off"
              required
              value={ownerPassword}
              onChange={(e) => setOwnerPassword(e.target.value)}
            />
          </label>
          <button disabled={busy}>Link my original workspace</button>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
