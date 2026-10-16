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
