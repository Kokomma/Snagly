"use client";
import AuthPanel from "../components/AuthPanel";
export default function OwnerAccess() {
  return (
    <AuthPanel
      setup={{ legacy: true, accounts: true }}
      initialMode="legacy"
      onSignedIn={() => window.location.assign("/owner/link")}
    />
  );
}
