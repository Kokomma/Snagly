"use client";
import { useState, useEffect } from "react";
import AccountPanel from "../../components/AccountPanel";
export default function LinkWorkspace() {
  const [account, setAccount] = useState(null),
    [error, setError] = useState("");
  async function load() {
    const r = await fetch("/api/account", { cache: "no-store" }),
      d = await r.json();
    if (!r.ok) {
      setError("Sign in or register before linking your existing workspace.");
      return;
    }
    setAccount(d.account);
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <main className="owner-link-page">
      <h1>Link your existing workspace</h1>
      {error && <p>{error}</p>}
      <AccountPanel
        account={account}
        reload={load}
        allowLegacyLink
        onRegister={() => window.location.assign("/owner")}
      />
      <a className="button" href="/">
        Go to Snagly →
      </a>
    </main>
  );
}
