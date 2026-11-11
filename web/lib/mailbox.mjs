import { getToken, startAuthorization, revokeToken } from "@vercel/connect";
import { workspaceIdentity } from "./workspace-context.mjs";
import { documentPdf } from "./pdf.mjs";
export function mailboxParams(provider, identity = workspaceIdentity()) {
  if (identity.legacy || !identity.verified)
    throw new Error(
      "Sign in with a verified personal account to connect email.",
    );
  if (!["gmail", "outlook"].includes(provider))
    throw new Error("Unsupported email provider.");
  return {
    subject: {
      type: "user",
      id: identity.uid,
      issuer: process.env.APP_ORIGIN || "https://snagly-personal.vercel.app",
    },
    scopes:
      provider === "gmail"
        ? ["openid", "email", "https://www.googleapis.com/auth/gmail.send"]
        : ["openid", "email", "offline_access", "User.Read", "Mail.Send"],
  };
}
export function connectorFor(provider) {
  const c =
    provider === "gmail"
      ? process.env.CONNECTOR_GMAIL
      : provider === "outlook"
        ? process.env.CONNECTOR_OUTLOOK
        : null;
  if (!c)
    throw new Error(
      "The app owner must finish this email provider’s OAuth setup first.",
    );
  return c;
}
export async function connectMailbox(provider) {
  const r = await startAuthorization(
    connectorFor(provider),
    mailboxParams(provider),
    {
      prompt: "select_account",
      callbackUrl:
        (process.env.APP_ORIGIN || "https://snagly-personal.vercel.app") +
        "/api/email/callback",
    },
  );
  return r.url;
}
export async function authorizedMailbox(provider, fetcher = fetch) {
  const token = await getToken(
    connectorFor(provider),
    mailboxParams(provider),
    { forceRefresh: true },
  );
  const url =
    provider === "gmail"
      ? "https://www.googleapis.com/oauth2/v3/userinfo"
      : "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName";
  const r = await fetcher(url, {
    headers: { Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(12000),
    redirect: "error",
    cache: "no-store",
  });
  if (!r.ok) throw new Error("Reconnect your mailbox in Settings.");
  const user = await r.json(),
    email =
      provider === "gmail" ? user.email : user.mail || user.userPrincipalName;
  if (
    !email ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    (provider === "gmail" && !user.email_verified)
  )
    throw new Error("A verified mailbox address is required.");
  return { token, email, provider };
}
export async function disconnectMailbox(provider) {
  await revokeToken(connectorFor(provider), {
    subject: mailboxParams(provider).subject,
  });
}
export function gmailRaw(a, from, pdf) {
  const safe = (s) => String(s).replace(/[\r\n]/g, "");
  const boundary = "snagly-attachment";
  return Buffer.from(
    [
      `From: ${safe(from)}`,
      `To: ${safe(a.recipient)}`,
      `Subject: =?UTF-8?B?${Buffer.from(a.subject).toString("base64")}?=`,
      `Message-ID: <${safe(a.id)}@snagly.app>`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(a.letter).toString("base64"),
      `--${boundary}`,
      pdf ? 'Content-Type: application/pdf; name="Resume.pdf"' : 'Content-Type: text/plain; charset=UTF-8; name="Resume.txt"',
      pdf ? 'Content-Disposition: attachment; filename="Resume.pdf"' : 'Content-Disposition: attachment; filename="Resume.txt"',
      "Content-Transfer-Encoding: base64",
      "",
      (pdf || Buffer.from(a.resume)).toString("base64"),
      `--${boundary}--`,
    ].join("\r\n"),
  ).toString("base64url");
}
export async function sendMailbox(a, mailbox, fetcher = fetch) {
  const pdf = await documentPdf(a.resume, "Resume");
  const gmail = mailbox.provider === "gmail";
  const r = await fetcher(
    gmail
      ? "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
      : "https://graph.microsoft.com/v1.0/me/sendMail",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + mailbox.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        gmail
          ? { raw: gmailRaw(a, mailbox.email, pdf) }
          : {
              message: {
                subject: a.subject,
                body: { contentType: "Text", content: a.letter },
                toRecipients: [{ emailAddress: { address: a.recipient } }],
                attachments: [
                  {
                    "@odata.type": "#microsoft.graph.fileAttachment",
                    name: "Resume.pdf",
                    contentType: "application/pdf",
                    contentBytes: pdf.toString("base64"),
                  },
                ],
              },
              saveToSentItems: true,
            },
      ),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    },
  );
  if (!r.ok) throw new Error("Mailbox did not confirm acceptance.");
  const data = gmail ? await r.json() : null;
  return {
    provider: mailbox.provider,
    id: gmail ? data.id : r.headers.get("request-id") || `accepted-${a.id}`,
    accepted: true,
  };
}
