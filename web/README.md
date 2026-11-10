# Snagly personal MVP

A private Next.js web application alongside the original Expo app in `../snagly`. The original app and its theme-switcher branch are preserved.

## Included

- Greenhouse, Lever and Ashby public career-board discovery; hourly authenticated scheduled endpoint and manual refresh. Each source has status/error reporting. Imported HTTPS vacancies are also supported.
- HiringCafe automated personal discovery through its documented public MCP search and details tools: one owner-configured search per clock hour, at most five job-detail fetches per run, no pagination/bulk crawling, provider rate-limit backoff. Only the saved search criteria are sent, never the CV, contact details or application history. Configure your search in Sources & settings. The first live interface checks returned a public Nigerian data-analyst posting and its complete description. Absent jobs in partial search results are never inferred closed. The service can change or restrict availability; heavy automated use is not supported by its documentation, so the adapter is deliberately bounded.
- HiringCafe and LaborX research cards with browse-and-import workflows. Platform application forms remain manual. LaborX is not an automated discovery source; its published terms prohibit automated use. Verify original employer conditions and country eligibility for every role.
- Multiple career categories, All view, arrangement filters, keyword search and newest/match sorting.
- Separate remote, hybrid and onsite country/city preferences. Blank physical-work country uses residence; blank cities means anywhere in that country. Remote never implies worldwide eligibility.
- Explicit employer eligibility review with evidence notes. Skill match is declared-skill keyword overlap, not a hiring probability.
- Truthful, extractive resume and letter templates: reorder the career history supplied by the owner and highlight matching declared skills. No invented facts, generative model dependency or hiring-probability claims. Plain-text CV import/export; PDF/DOCX parsing is not included.
- Networking contact research links and personalized drafts. No fabricated contact identities and no automatic outreach.
- Switchable Review & Approve / Auto Apply modes. The email channel is the only supported automatic submission adapter. Employer ATS forms are completed manually.
- Application tracker, notes, CSV export, manual submission recording, follow-up drafts/reminders, activity dashboard and in-app notifications.

## Local development

Use Node 24 LTS. From `web/`:

```powershell
npm ci
Copy-Item .env.example .env.local
# Set your owner password and a random session secret in .env.local.
npm run dev
```

The owner password must have at least 16 characters; the session secret must have at least 32. Never commit either. Without cloud database configuration, development saves to ignored `.data/state.json`. Hosted deployments never fall back to local filesystem storage.

```powershell
npm test
npm run build
# Optional: against a running, blank LOCAL test workspace only:
node tests/http-smoke.mjs
```

The HTTP smoke test uses fictional data, checks real API persistence and restores the empty local workspace. It makes no external application submissions. The unit tests inject a fake email provider.

## Submission permissions

Sending is OFF by default. Three independent layers must be configured:

1. Server: `ENABLE_SUBMISSIONS=true`, `RESEND_API_KEY`, verified `APPLICATION_FROM`.
2. Workspace: explicit sending permission; Auto Apply mode for scheduled sends.
3. Application: exact saved resume, letter, subject and verified recipient preapproved for seven days.

All sends additionally require a complete profile, confirmed employer eligibility, matched location, minimum skill score, confirmed salary floor when configured, an open vacancy and available daily capacity. Changing profile facts, job eligibility or package content invalidates earlier approvals. Mode and rules are checked inside each send reservation.

Reservations are committed before contacting the provider. Concurrent requests cannot send the same application twice. Provider idempotency keys are stable. A crash or uncertain provider result stays locked as `sending` / `uncertain`; do not retry blindly. Inspect the provider using the application ID and reconcile the record before any future attempt. Provider acceptance is recorded as such and does not claim employer review or delivery.

Credentials, application permissions and real recipient addresses are intentionally not preconfigured. Owner-configured email sending should only be used where the employer explicitly accepts email applications. CAPTCHAs, sensitive answers and unsupported forms require manual completion.

## Hosting

Firebase project: `snagly-personal-kokomma`. Firestore database: `snagly`, Enterprise Native mode, London (`europe-west2`), deletion protection enabled. This dedicated database was created with free-tier eligibility. PostgreSQL/Supabase are not used.

Server-only variables: `FIREBASE_PROJECT_ID`, `FIRESTORE_DATABASE_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`. The generated service identity has `roles/datastore.user` on the dedicated Snagly project, not project-admin access. Firebase's Admin SDK uses transactions for all updates; network discovery and email delivery run outside retryable transaction callbacks. The browser has no Firebase credential or direct database access. Prototype Firestore Rules deny all client operations. Rules do not constrain Admin SDK access; owner authentication and input validation remain essential.

Storage uses compressed, chunked personal workspace snapshots under `snaglyOwner/workspace` and its `chunks` subcollection. Each chunk is at most 650 KB; the MVP enforces 40 MB uncompressed / 4 MB compressed workspace limits. This is a single-owner design, not a multi-tenant database model. Direct document transactions preserve atomic approval and submission reservations; no Firestore search queries or pipelines are needed for these keyed snapshot operations.

Vercel project: `ellas-projects-75a7ecc5/snagly-personal`. Git repository root directory setting: `web`. The branch `codex/personal-mvp` contains the web MVP; `main` is preserved for review.

Owner authentication, Firebase credentials and `CRON_SECRET` are stored in Vercel's protected environment settings. Never send secrets in chat. The scheduled route accepts only `Authorization: Bearer <CRON_SECRET>`. The checked-in `hourly-discovery` uses Vercel Schedules (not legacy Cron), which supports hourly runs on Hobby with a 15-minute jitter window. Hobby has a shared team allowance of 5,000 schedule runs per billing period; this job uses approximately 720 per month before manual runs. Monitor usage and execution history. Scheduled runs do not guarantee discovery at the exact top of the hour.

In-app notifications are supported. Email/push notifications and generative AI enrichment are not enabled in this MVP. The app starts empty; add your actual profile, preferences and chosen employer boards before expecting personalized results.

## Boundaries

Single owner only. No payments, subscription plans or multi-user administration. Sources are public APIs from configured company boards, not an unrestricted web crawler. Source response sizes/timeouts and source count are bounded. Existing application records are retained. Use the provider's own backup facilities for production data.

## Documentation

- [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html)
- [Lever Postings API](https://github.com/lever/postings-api)
- [Ashby Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api)
- [HiringCafe documented search interface](https://hiringcafe.com/documentation/hiringcafe-chatgpt-app)
- [Resend email endpoint](https://resend.com/docs/api-reference/emails/send-email)
- [Vercel cron plan limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)
