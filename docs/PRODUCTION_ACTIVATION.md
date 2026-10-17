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
- Production client `a48de168-7241-40d5-98a4-6aa0aa72b40b` is registered with PKCE and the exact ChatGPT callback. Its collector grant is restricted to the Freddo owner and expires 14 January 2027 at 16:33:58 UTC. Owner consent completed in Chrome and ChatGPT confirmed the connection. The manual all-three cloud persistence/chunk/replay test completed successfully; see the verified run below.
- Owner operator access expires 16 October 2027 at 16:26:49 UTC.
- A sending-only, domain-restricted Resend credential is stored in the personal project. Maintenance is enabled and its Vault-authenticated Cron runs every five minutes. An unattended run at 16:30 UTC succeeded and produced zero duplicate alerts after the initial manual check.
- The RSA recovery pair is in `~/Documents/Freddo Recovery/` with owner-only permissions. Separate maintenance/backup credentials are stored in Supabase. GitHub now has the separate export credential and public encryption key; both backup activation switches are enabled. The first encrypted cloud artifact was restored successfully into an isolated database (details below).
- The existing daily task `6acfbd68ef908190b1123f2a6249fdf3` was updated and read back in ChatGPT with the production prompt, 08:00 Europe/London, DST-aware scheduled slots, and preferred 16,384-byte chunks (49,152 maximum). No duplicate was created. Its next unattended production executions remain acceptance gates.

Remaining verification: synthetic live retention and operator mutation checks, recipient-side confirmation of production emails, and the elapsed-day acceptance gates. Owner sign-in, private image preview, cloud backup restoration and scheduled paused-index calculation are verified below. All 112 local tests and the four Deno entrypoint checks passed after the owner-only and production-client changes. No remaining ticket is closed solely on those local results.


### Production cloud persistence proof

Run `d9d3f9e5-56f0-4676-860b-8c041c99049b` completed at 2026-10-16 16:43:33 UTC. Independent read-only SQL in the personal project verified its complete state, three immutable observations, and three stored JPEG evidence records linked through their attempts.

| Retailer | Normal / public offer | Observation UTC | Evidence ID | Bytes | SHA256 |
| --- | --- | --- | --- | --- | --- |
| Tesco | 35p / none | 16:38:52.878 | `907dbae6-c79f-4e76-8230-56daf20b0d5b` | 118573 | `d8cbaa73048391f813a67a800f4f30c4a595757bb19fd3e79efa1ff3d0868ef5` |
| ASDA | 34p / 32p | 16:39:07.701 | `f0945d43-d224-4ce3-8ab1-74826715587b` | 99019 | `ca3a5605f13e5835bde8a24f019ccf4c7eef29424c11a1c0ca5c197cedc1dcfc` |
| Sainsbury's | 45p / none | 16:39:24.336 | `a40a846b-c0fe-49c3-b8b6-8ca1d5d209f1` | 83341 | `be58ab6bd8c5a29e81bed7360b14ae81faf0760998868d46611d06290bbe65c7` |

All were single 18g bars. The cloud collector reported 8/7/6 chunks respectively, identical replay returning `replayed=true`, and changed-payload replay returning `CONFLICT`. The database independently confirms only the original three observations. This manual run does not prove two later unattended days or seven consecutive qualification dates.

The independent watchdog also recorded one accepted recovery email for the restored collector grant, provider receipt `01a14591-248b-7296-9097-09c410d81f46`. Resend subsequently reported Delivered for all six production failure/recovery events. Recipient-side Gmail search currently finds only the earlier restricted test message; inbox confirmation of the production events remains outstanding. Do not equate the provider delivery status with a verified inbox location.


### Independent cloud jobs and recovery proof

- GitHub Free account usage was checked before activation: 417 of 2,000 included minutes, 0 GB of 0.5 GB storage, and $0 billable usage. No paid plan was enabled.
- Both backup switches were enabled on 16 October. [Cloud backup run 38940326369](https://github.com/ashsquires/TheFreddoIndex/actions/runs/38940326369) succeeded in 16 seconds on published commit `fed110e`. The existing workflow runs daily at 11:23 UTC and retains seven daily/four weekly encrypted artifacts.
- Downloaded artifact `12062572095`, `freddo-daily-2026-10-16-38940326369`, was 4,428 bytes including its ZIP container. Its SHA256 matched GitHub: `fba509cea6d1bbba277d3b16b84c87d9304dd1e6dc05ffc4a9b6a905b1ccd98e`.
- The artifact decrypted with the owner's private recovery key and restored into a fresh isolated PGlite database in **280 ms**. Every exported table row and the entire evidence manifest matched after restoration: three retailers, one product, three sources, one policy, one run, three run sources, three attempts, three observations, three reviews, three screenshot records, three incidents and four alert events. No index members/values existed at export time. Newest recoverable observation: **2026-10-16T16:39:24.336Z**. This measures local logical restoration only, not disaster-recovery provisioning. Image bytes are not backed up.
- Index calculation was enabled at 17:31 UTC. Cron created paused revision `593e4b5f-2560-4abf-8059-e1d67989c73f` at 17:35:03 UTC for the 09:00 UTC/10:00 UK cutoff, with zero admitted members and null average. Later runs through 21:10 UTC reused that revision without duplicates.
- The independent watchdog recorded backup recovery receipt `01a145c8-1792-7806-9149-c38c30ad0189` and paused-index alert `01a145c8-1860-7246-9dab-d2b0b7e71d5a`, each with one delivery attempt. Six consecutive later maintenance runs completed with zero failures, zero new alerts and zero cleanup failures.
- Owner magic-link sign-in to the deployed monitor succeeded at 21:14 UTC. It displayed all three retailer observations, paused index, completed backup, 0.57 MiB storage usage, and notification history. ASDA's private screenshot preview loaded at 1348×926 pixels via the authenticated operator endpoint; preview states its two-minute expiry. No public navigation link was added.
