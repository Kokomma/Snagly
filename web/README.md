# Snagly

Next.js career workspace alongside the preserved Expo app. Live: https://snagly-personal.vercel.app. Development branch `codex/personal-mvp`; main is preserved.

## Accounts

Firebase email/password accounts use HttpOnly, SameSite Strict session cookies. Every request verifies session revocation and current user status. The immutable authenticated UID scopes all storage to `snaglyUsers/{uid}`; client-supplied IDs cannot select another account. Each person has separate profile, preferences, jobs, applications and history. Firestore Rules deny browser access; authenticated server transactions enforce isolation.

Original owner access is `/owner`. Register a fresh account, then visit `/owner/link` with the original owner password. Atomic linking preserves the original `snaglyOwner/workspace` backup, refuses to overwrite an account with career data, clears sending approvals, and blocks further legacy access. Owner migration controls are absent from normal public/account screens.

Workspace snapshots use gzip chunks up to 650 KB, limited to 40 MB uncompressed / 4 MB compressed. The server identity has datastore access plus scoped Firebase session/user lookup permissions, not project administration. Secrets never enter browser responses or Git.

## Discovery and documents

Verified users save skills, interests, career history, categories, application answers and separate remote/hybrid/onsite country/city preferences. PDF, DOCX and text CV imports are supported. Saving initializes HiringCafe and six checked starter employer feeds from Greenhouse, Lever and Ashby, then runs discovery immediately. For you ranks by skills/categories; All jobs remains available. This is a starter employer selection, not an exhaustive index of every employer on those platforms.

Additional supported company career-board URLs are recognized automatically and checked immediately. Arbitrary hosts are rejected without fetching them. Other sites need an adapter or manual import. LaborX remains manual because its terms prohibit automated access. HiringCafe uses the documented MCP interface: one profile-derived search per clock hour, at most five detailed matches, quota reservation and backoff. CV/contact/history are not sent to HiringCafe. Partial search absence never closes earlier jobs.

Location and work eligibility are never guessed. Keyword matching is not a hiring probability. Submitted CV/letter packages are locked and accessible through the tracker for interview preparation. Exports currently use plain text.

## Free-only AI

Settings contains explicit consent and enable/pause controls. Gemini connects directly through the Google AI SDK provider, with GOOGLE_GENERATIVE_AI_API_KEY, AI_FREE_MODEL=gemini-3.5-flash-lite and GOOGLE_FREE_TIER_CONFIRMED=true. Project billing was confirmed disabled; a direct synthetic generation succeeded. Do not attach billing to this dedicated project for free-only operation. The unused Gateway budget does not buy credits or participate in application requests.

AI produces a tailored CV, letter, fit explanation, gaps and networking draft from career evidence. Free-tier content may be used to improve Google products; users consent first. The provider quota is shared by the app project. HTTP 429 preserves the original package, queues an hourly retry after cooldown, and never falls back to a paid model. Up to two queued drafts are processed per pass; enabled discovery queues new drafts too.

Validation checks evidence references and invented numbers, but cannot prove every natural-language claim. Human truth review remains necessary. Profile/job/draft changes block stale results. External generation runs outside retryable transactions.

## Email and Auto Apply

Gmail and Outlook adapters use per-user OAuth through Vercel Connect, bound server-side to Firebase UID. Tokens never enter snapshots or browser responses. Users connect existing mailboxes, without creating email or developer accounts. Snagly's one-time Google/Microsoft OAuth client registrations and connector attachments remain required. Settings shows unavailable connections honestly. Snagly folders/categories and inbox organization are not implemented; inbox reading would need extra consent.

Set CONNECTOR_GMAIL / CONNECTOR_OUTLOOK after provider registration and project attachment. Google uses openid, email and Gmail send. Microsoft uses openid, email, offline_access, User.Read and Mail.Send; personal Microsoft accounts must be supported. Enable ENABLE_SUBMISSIONS only after real connector checks. Registered accounts cannot fall back to the legacy Resend sender.

Review & Approve prepares drafts. Auto Apply sends exact preapproved email packages that pass all rules; universal ATS form submission is not supported. Approval binds the saved package/recipient/profile for seven days. Sending additionally checks verified account, connected mailbox/profile email, permission, mode, eligibility, location, score, salary floor, healthy recent source, daily cap and duplicates. Reservations commit before external sending; uncertain outcomes remain locked without automatic retry. Provider acceptance is not proof of delivery or employer review. No real applications/messages were sent in development.

## Hosting and validation

Firebase project snagly-personal-kokomma; named Enterprise Native database snagly, London europe-west2, deletion protection enabled. Vercel project ellas-projects-75a7ecc5/snagly-personal, root web, Node 24, lhr1. Protected environment configuration lives in Vercel; .env.example lists names only.

Vercel Schedules runs hourly with Africa/Lagos timezone and 15-minute jitter. The cron route requires its bearer secret, verifies each account, and uses isolated workspace contexts with bounded concurrency. In-app notifications and daily activity are supported; push is not configured.

Use npm ci, configure .env.local, then npm run dev. Checks: npm test and npm run build. Local files are .data/users/{uid}.json or legacy .data/state.json; storage requires an authenticated context. Hosted deployments never fall back to local files. Tests use fictional data and injected providers.
