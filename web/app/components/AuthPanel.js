"use client";
import { useState } from "react";
import BrandLogo from "./BrandLogo";
export default function AuthPanel({
  setup,
  onSignedIn,
  initialMode = "signin",
  onCancel,
}) {
  const [mode, setMode] = useState(initialMode),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const choose = (v) => {
    setMode(v);
    setPassword("");
    setConfirm("");
    setError("");
    setMessage("");
  };
  async function submit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (mode === "register" && password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operation: mode, name, email, password }),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error || "Sign-in could not be completed.");
      if (mode === "reset") {
        setMessage(d.message);
        return;
      }
      setPassword("");
      setConfirm("");
      await onSignedIn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-scene">
      <div className="auth-layout">
        <section className="auth-story">
          <a className="auth-brand" href="/" aria-label="Snagly home">
            <BrandLogo />
          </a>
          <span className="eyebrow">YOUR CAREER. YOUR DIRECTION.</span>
          <h1>
            A clear path to
            <br />
            <span>your next role.</span>
          </h1>
          <p>
            Bring your experience, your interests and your ambition.
            <br />
            We’ll help you put them to work.
          </p>
          <figure className="auth-photo">
            <img
              src="/brand/career-hero.png"
              alt="A professional thoughtfully preparing her next career move at her desk"
            />
            <figcaption>Make room for what comes next.</figcaption>
          </figure>
          <div className="auth-points">
            <span>✓ Your private profile</span>
            <span>✓ Your own job preferences</span>
            <span>✓ Your progress, together</span>
          </div>
        </section>
        <section className="auth-form-card">
          <div className="auth-tabs" role="group" aria-label="Account access">
            <button
              type="button"
              className={mode === "signin" ? "selected" : ""}
              onClick={() => choose("signin")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === "register" ? "selected" : ""}
              onClick={() => choose("register")}
            >
              Register
            </button>
          </div>
          <span className="eyebrow">
            {mode === "register"
              ? "A SPACE THAT’S ALL YOURS"
              : "WELCOME TO YOUR NEXT MOVE"}
          </span>
          <h2>
            {mode === "register"
              ? "Create your account"
              : mode === "reset"
                ? "Reset your password"
                : mode === "legacy"
                  ? "Your original workspace"
                  : "Welcome back"}
          </h2>
          <p className="muted">
            {mode === "register"
              ? "Your profile, CV and applications stay separate from everyone else’s."
              : mode === "legacy"
                ? "Use the original owner password. You can link this workspace to an email account after registering."
                : mode === "reset"
                  ? "We’ll email you a secure link to choose a new password."
                  : "Sign in to pick up where you left off."}
          </p>
          <form onSubmit={submit}>
            {mode === "register" && (
              <label className="field">
                <span>Your name</span>
                <input
                  autoComplete="name"
                  maxLength={100}
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            )}
            {mode !== "legacy" && (
              <label className="field">
                <span>Email address</span>
                <input
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            )}
            {mode !== "reset" && (
              <label className="field">
                <span>
                  {mode === "legacy" ? "Original owner password" : "Password"}
                </span>
                <input
                  type="password"
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  required
                  minLength={mode === "legacy" ? 1 : 8}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {mode === "register" && (
                  <small>
                    At least 8 characters. Choose a unique password.
                  </small>
                )}
              </label>
            )}
            {mode === "register" && (
              <label className="field">
                <span>Confirm password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={128}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
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
            <button className="primary auth-submit" disabled={busy}>
              {busy
                ? "One moment…"
                : mode === "register"
                  ? "Create my account →"
                  : mode === "reset"
                    ? "Send reset link →"
                    : mode === "legacy"
                      ? "Open original workspace →"
                      : "Sign in →"}
            </button>
            {mode === "signin" && (
              <button
                className="text-link"
                type="button"
                onClick={() => choose("reset")}
              >
                Forgot your password?
              </button>
            )}
          </form>
          <div className="auth-fineprint">
            {mode === "register"
              ? "We’ll send you a verification email. Each account gets its own private workspace."
              : "Your career details belong to your account."}
          </div>
          {onCancel && (
            <button className="text-link" onClick={onCancel}>
              ← Back to your workspace
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
