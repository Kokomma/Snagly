# Firebase storage, version 2

Firebase Authentication and the existing Enterprise Native database remain in use.

Each account root points at an immutable storage generation. Profile, settings,
activity and notifications have separate records. Eight stable hash buckets hold
small job summaries; eight hold application metadata. Posting descriptions and
CV/cover-letter/AI packages have separate immutable, content-addressed bodies.
Only public source descriptions share the global public-body collection. Imported
descriptions, eligibility notes, profiles and application packages remain scoped
to the account. All access is server-side; Firestore client rules remain deny-all.

The compatibility transaction callback sees summaries by default. Explicit job or
application IDs hydrate only their bodies. A skill change hydrates descriptions
once to recalculate exact keyword matching. Saves compare section hashes and
write only changed sections/bodies plus the atomic account revision. Large posting
batches stage immutable bodies before atomically publishing their references.

The overview returns featured and tracked job summaries. `/api/jobs` filters and
returns 60 summaries per page. `/api/workspace?jobId=…` returns one vacancy and its
saved package. Opening the overview or another page does not read CV bodies.
Small metadata sections are cached by account path and content hash for up to
30 minutes, with a root revision check for each transaction. Immutable bodies can
also be cached. Writes and sending reservations retain transaction conflict checks.

## Safe upgrades

`STORAGE_V2_MIGRATIONS_ENABLED` gates legacy upgrades. Deploy the new reader with
the gate disabled and allow old functions to drain before enabling it. An upgrade
stages records in a new generation, reconstructs the complete workspace, compares
a canonical digest, and then switches the root pointer only if the original
revision has not changed. Original compressed chunks are retained as a backup;
normal version-2 writes never change them. A failed or interrupted stage leaves
the original pointer active. Linking the original owner workspace also recognizes
version-2 records and preserves the overwrite guard.

## Free allowance protection

Optional hourly work reserves conservative estimated read/write units in a daily
ledger aligned with Pacific time. Background/migration reservations stop at 30,000
estimated reads or 24,000 estimated writes, leaving foreground headroom. This is
an application safety budget, **not** Firebase's complete measured usage: index
overhead, other clients, cold instances, and foreground traffic can differ.
Migration refuses an estimated write batch above 22,000 units. No paid billing
or application sending is enabled by the storage upgrade.

Monitor actual Firebase usage after reset and normal operation. Retained backups
and historical immutable application bodies also consume storage; implement
reviewable retention before deleting historical user data.
