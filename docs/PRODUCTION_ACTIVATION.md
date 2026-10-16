# Freddo production activation

Prepared 16 October 2026. Target **only** personal Supabase `ectikpmaidqobqfsqife`, GitHub `ashsquires/TheFreddoIndex`, and Resend domain `thefreddoindex.com`.

## Access to activate

1. Register a separate public OAuth client for ChatGPT, authorization-code + PKCE. Allow only ChatGPT's displayed callback URL. Add its exact public client ID to `src/oauth-clients.js`. The existing probe client remains test-only.
2. Add one `production_access` entry for Freddo owner `fb99ddb0-4537-46e3-a826-c26a71f13def`, new client ID, **collector only**, expiry 90 days after activation. It can save/read its own approved collection runs and private evidence. It cannot administer tables, read other users' runs, or change index membership. Live session and grant are checked on every call. The owner completes consent in ChatGPT once. A naturally refreshed-token run still needs proof.
3. Add operator access for that owner only, expiring in 365 days. The private monitor can read collection history and temporary screenshot links, accept/reject/correct observations, and explicitly admit/remove/reweight retailers or request a new index revision. No anonymous access.
4. Deploy `freddo-ingest`, `freddo-ops`, `freddo-maintenance`, `freddo-backup` using their own authentication checks instead of the legacy JWT gateway. Without their explicit grant/key they deny requests. No service-role key goes into ChatGPT, the website or GitHub.
5. Create a new Resend **sending-only**, `thefreddoindex.com`-restricted key, stored as `FREDDO_ALERT_RESEND_KEY` in this Supabase project. Sender and recipient are fixed in code: `alert@thefreddoindex.com` → `thefreddoindex@gmail.com`. New/actionably changed failures and recovery use durable deduplication. Provider acceptance is not inbox confirmation.
6. Generate two independent random job keys. `FREDDO_MAINTENANCE_KEY` stays in Supabase Functions secrets and Vault for Cron. `FREDDO_BACKUP_KEY` is shared only between the backup function and this repository's encrypted Actions secret. It authorizes logical exports and backup acknowledgements, never arbitrary database queries.
7. Generate a 3072-bit RSA recovery key. Store the **private** key in an owner-controlled recovery location outside this repository and outside GitHub. Publish only the public key as `FREDDO_BACKUP_PUBLIC_KEY`. Confirm the owner has the private key before enabling backups.
8. Enable cloud maintenance every five minutes. The database uses Europe/London to determine the 10am cutoff. It independently monitors the 8am collector, sends email, and cleans expired evidence through Storage API. Retention is 365 days for observation images, 30 for diagnostics; orphan/upload grace is at least 24 hours. File deletion is permanent; price/review/metadata history remains.
9. Enable encrypted daily GitHub backup at 11:23 UTC. Keep seven daily and four weekly artifacts (encrypted size limit 20 MiB each). No paid plan change. Existing account-wide usage must be checked before enabling. Image bytes are **not backed up**, only their metadata/checksums.
10. Update the existing 8am UK ChatGPT task, not a duplicate or a local Codex automation. Validate one full three-retailer run and two later unattended days. Keep actual seven-day source admission proof distinct. No retailer is automatically admitted.

## Activation switches

`FREDDO_MAINTENANCE_ENABLED`, `FREDDO_BACKUP_ENABLED`, `FREDDO_INDEX_ENABLED` default disabled when absent. GitHub variable `FREDDO_BACKUP_ENABLED` also defaults disabled. Index may calculate paused private records with zero members; no public chart is changed. Do not populate memberships until the seven-date qualification and explicit decision.

## Required cloud evidence before closing tickets

- Production OAuth consent, wrong audience/client/user and revoked/expired-session denial.
- All three sources saved through ChatGPT with screenshot hash/read-back, including a multi-chunk image, identical replay and conflicting replay.
- A real unattended failure email, repeated-check deduplication, then recovery. Preserve provider receipt separately from recipient confirmation.
- Live cleanup/restore tests using synthetic records, no real price deletion.
- A downloaded encrypted GitHub artifact restored into an isolated database; compare counts, IDs, prices, reviews and evidence manifest.
- Two later scheduled persistence days (#6) and seven consecutive actual UK dates before admission (#2/#9). Local clock simulations cannot replace these gates.

The deployment must not be represented as complete while any connection or elapsed-day evidence remains outstanding.

## Verified activation progress — 16 October 2026

- All seven application migrations and private evidence buckets are deployed. All four production functions are deployed with handler authentication; unauthenticated calls return 401/403.
- Main and Pages include the owner-only consent/review implementation. The monitor remains absent from public navigation and the sitemap.
- Production client `a48de168-7241-40d5-98a4-6aa0aa72b40b` is registered with PKCE and the exact ChatGPT callback. Its collector grant is restricted to the Freddo owner and expires 14 January 2027 at 16:33:58 UTC. Owner consent completed in Chrome and ChatGPT confirmed the connection. A manual all-three cloud persistence/chunk/replay test was launched in the existing collector chat; its result has not yet been inspected.
- Owner operator access expires 16 October 2027 at 16:26:49 UTC.
- A sending-only, domain-restricted Resend credential is stored in the personal project. Maintenance is enabled and its Vault-authenticated Cron runs every five minutes. An unattended run at 16:30 UTC succeeded and produced zero duplicate alerts after the initial manual check.
- The RSA recovery pair is in `~/Documents/Freddo Recovery/` with owner-only permissions. Separate maintenance/backup credentials are stored in Supabase. GitHub credential configuration and encrypted artifact verification remain pending; backup activation is not yet complete.
- The latest ChatGPT trial on 16 October reported all three prices and screenshots successfully, but did not write production observations. The existing daily task remains 08:00 Europe/London pending the production connector.

Browser completion was interrupted by the Mac locking. Remaining setup requires unlocking the browser session: inspect the in-flight production trial; update the existing 08:00 task only after transport proof; configure/check GitHub storage and backup credentials; enable and restore a real encrypted artifact; verify production email delivery/recovery and live retention. All 112 local tests and the four Deno entrypoint checks passed after the owner-only and production-client changes. No remaining ticket is closed solely on those local results.
