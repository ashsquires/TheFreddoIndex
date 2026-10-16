# Collection operation and recovery

All production connections are listed in [activation](PRODUCTION_ACTIVATION.md). Ticket state remains in GitHub, not this guide.

## Deploying

`node scripts/build-collection-deploy.mjs` builds an atomic SQL package with a private version/hash ledger. Apply only in the personal Freddo dashboard after verifying project ref. Reapplying identical files is safe; changing an applied file is refused. The first schema migration was applied16October2026. Later changes must be new migrations. This dashboard ledger does not populate Supabase CLI migration history: baseline/repair that history deliberately before switching to CLI deployment, never replay all migrations blindly.

`node scripts/build-edge-deploy.mjs` creates four standalone dashboard files under `/private/tmp/freddo-edge-deploy`. They keep pinned runtime dependencies. Deploy with handler authentication, then test unauthorized access before adding grants. Build static consent/monitor assets with `npm run build`. The monitor is private data behind authentication; its HTML login shell contains no prices or secrets.

## Pause and resume

Pause the existing ChatGPT collector in ChatGPT. Disable `FREDDO_INDEX_ENABLED` to pause calculations without disabling monitoring. Disable `FREDDO_MAINTENANCE_ENABLED` only when intentionally pausing email/cleanup as well, and record the monitoring gap. Disable GitHub's backup variable independently. Resume the same schedules and read back run/job receipts; do not create duplicate daily schedules. Historical missing days remain missing.

## Replaying retained collection outputs

Keep original UTC observed/captured timestamps, exact approved source IDs, screenshot bytes and hashes. Use identical request keys to recover an uncertain write; use `get_run_v1` before inventing a new request. A request-key conflict means the payload changed and must be investigated. Closed scheduled slots reject new late uploads; replay historical evidence through an explicitly authorised manual run for the original UK date, with actual observation windows and provenance. Never use today's timestamp to make old evidence fresh. Review the result and request a new index revision for the affected cutoff, giving a reason. Do not turn synthetic fixtures into production observations.

## Review and membership

Use `/monitor.html` with the allowlisted Freddo owner. Outstanding quarantines remain visible after newer observations arrive. Corrections append facts at the original observation time; they do not edit history. Stale edit sequences return a conflict and require refresh. Accepted/rejected history stays intact. Weight changes close an existing membership and admit a replacement interval explicitly; admission checks seven valid preceding UK dates for the source. No missing retailer is silently dropped from the denominator. A membership cannot be retroactively changed before the current UK date through this UI.

## Evidence lifecycle

Private final bucket accepts PNG/JPEG/WebP up to5MiB. Private staging accepts49,152-byte chunks. Stored evidence requires byte-size, hash and actual image decoding. Missing image does not erase a price. Cleanup freezes selected paths against uploads, respects a ten-minute upload lease and a24-hour abandonment grace, calls Storage API, then records expiration. A failed delete retains retryable metadata. Prices, corrections and evidence links are never deleted by cleanup. Signed previews expire after120seconds.

## Backups and restore

Backups are gzip-compressed JSON encrypted with AES-256-GCM; the random data key is wrapped with RSA-OAEP-SHA256. GitHub receives only ciphertext. Never commit recovery private keys, raw exports, grants, or service credentials. Exports exclude authentication records, credentials and delivery-request payloads. Screenshots are represented by a manifest only; image bytes have no independent backup protection.

Download a retained artifact from GitHub, unzip the artifact container, and use `scripts/backup-crypto.mjs` to decrypt `freddo-backup.enc` with the owner's recovery private key. `scripts/restore-backup.mjs` restores a supported export into an explicitly isolated database adapter inside one transaction. It refuses an unspecified isolated target, checks table names, omits generated date columns and inserts revisions/reviews in order. Compare exported table rows/IDs and the full evidence manifest before considering restoration successful. The test suite performs this process in a fresh PGlite PostgreSQL engine; first measured restoration of a synthetic one-price export was106ms (3,127 encrypted bytes), newest observation16October202608:00UTC. This is a local logical-restore measurement, not a production recovery-time promise or proof of cloud backup activation.

A production disaster recovery is a separate deliberate deployment: provision a new isolated Supabase project, apply migrations, restore tested application facts, recreate private buckets, then reconnect credentials and schedules. Do not restore expired sessions or resend old notification queues. Missing image files remain visibly missing. Verify all three retailers and new screenshots before switching consumers. Take an encrypted pre-change export before migration recovery. Prefer a forward fix; never drop history-bearing tables to roll back code.

## Credentials and notifications

Revoke a production access row to stop ChatGPT immediately; revoke its Supabase session/client when replacing the connection. Grant expiry emits a48-hour warning, then visible failure; it must not be silently extended. Reconnect with a new reviewed client/grant and consent. Keep the old probe restricted. Resend keys are sending-only and domain-scoped. Rotate job keys in their two intended locations and test before retiring old credentials. Do not put secrets in prompts or repository files.

Email events distinguish pending, leased, provider-accepted and failed. Acceptance is not delivered-to-inbox proof. Stable provider idempotency keys suppress retries; unknown delivery after23hours stops rather than risking reuse beyond Resend's24-hour idempotency window. The private report retains that uncertainty. Entire Supabase outages can prevent both detection and sending; GitHub backup job failure remains a separate signal, and GitHub notification routing must be configured by the owner if required.
