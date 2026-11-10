import { autoBlockers, now, event, notify } from "./model.mjs";
import { transact } from "./store.mjs";
// Commit the reservation BEFORE the external side effect. A crash stays locked for reconciliation.
export async function sendApproved(
  id,
  { automatic = false, revision } = {},
  fetcher = fetch,
  env = process.env,
  transaction = transact,
) {
  const snapshot = await transaction((s) => {
    if (revision !== undefined && revision !== s.revision)
      throw new Error("Workspace changed. Refresh and try again.");
    if (automatic && s.preferences.mode !== "auto")
      throw new Error("Auto Apply has been paused.");
    const a = s.applications.find((x) => x.id === id);
    if (!a) throw new Error("Application missing.");
    const blockers = autoBlockers(s, a, env);
    if (blockers.length) throw new Error(blockers.join(" "));
    a.status = "sending";
    a.attemptedAt = now();
    event(
      s,
      "sending",
      "Email submission reserved. Duplicate attempts are locked.",
      a.jobId,
    );
    return structuredClone({ application: a, profile: s.profile });
  });
  const a = snapshot.application;
  // Stable provider idempotency key. Uncertain sends are never automatically retried.
  try {
    const r = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `snagly-${a.id}`,
      },
      body: JSON.stringify({
        from: env.APPLICATION_FROM,
        to: [a.recipient],
        reply_to: snapshot.profile.email,
        subject: a.subject,
        text: a.letter,
        attachments: [
          {
            filename: "Resume.txt",
            content: Buffer.from(a.resume, "utf8").toString("base64"),
          },
        ],
      }),
    });
    if (!r.ok) throw new Error("Provider response was not successful.");
    const receipt = await r.json();
    if (!receipt.id) throw new Error("Receipt missing");
    a.status = "submitted";
    a.submittedAt = now();
    a.receipt = { provider: "resend", id: receipt.id, at: now() };
    a.followUpAt = new Date(Date.now() + 7 * 86400000).toISOString();
  } catch {
    a.status = "uncertain";
    a.error =
      "Submission outcome is uncertain. Check the email provider; automatic retry is blocked.";
  }
  await transaction((s) => {
    const stored = s.applications.find((x) => x.id === id);
    if (!stored || stored.status !== "sending")
      throw new Error(
        "Submission reservation changed; reconcile the provider receipt.",
      );
    Object.assign(stored, a);
    if (a.status === "submitted") {
      event(
        s,
        "submitted",
        `Application email accepted by provider: ${a.subject}`,
        a.jobId,
      );
      notify(s, `Application sent: ${a.subject}`, `submitted:${a.id}`);
    } else event(s, "submission-error", a.error, a.jobId);
  });
}
