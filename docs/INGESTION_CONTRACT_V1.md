# Freddo ingestion contract v1

Design for #4; implementation belongs to #5–#8. This document does not claim these production tools are deployed. Target only `ectikpmaidqobqfsqife`.

## Selected transport and authority

Use authenticated MCP Streamable HTTP with JSON responses and OAuth authorization code + PKCE, as proven by the restricted probe. Keep protocol negotiation separate from application `contract_version: 1`. Deploy a separate production resource `/functions/v1/freddo-ingest`; do not silently expand the seven-day test grant. Explicit owner consent, a registered client, receiver audience, live session and server-controlled role grant are required before production writes. ChatGPT holds OAuth credentials; project service credentials remain in Edge Function managed secrets. Neither token nor signed URL is written into prompts or logs.

Roles: collector may ingest approved sources and read its runs; monitor may read health/alerts only; operator may review observations, change membership and manage grants. A collector cannot accept quarantines, change policy/source manifests, delete evidence or run SQL. OAuth `email` scope is identity disclosure, not these application permissions. Enforce roles in private server-side grants, not user-editable metadata. Verify signature, issuer, exact audience, role, expiry, subject, client and live session before any data access. Unknown or unauthorized IDs return the same NOT_FOUND result to avoid existence disclosure.

## Common envelope and validation

Every tool argument is an object with `contract_version: 1`; unknown fields are rejected. UUIDs use canonical UUID syntax. Mutation requests include `request_key` (1–80 ASCII letters, digits, underscore or hyphen). Server receipts contain `{contract_version, request_id, received_at, replayed, data}`. Errors contain `{contract_version, request_id, error:{code,message,retryable,retry_after_seconds}}`; messages exclude credentials, raw upstream bodies and private URLs. MCP errors set `isError:true`. Authentication failures use HTTP401 with discovery challenge; authorization failures use403, transient auth-provider failure503. No success receipt on partial database transaction failure.

All times are ISO8601 UTC instants; UK dates are server-derived with Europe/London. Observation times may not be more than five minutes in the future, before attempt start, or after attempt finish; capture times may differ and are retained separately. Delayed delivery retains original times. Server creation time is never a substitute. Scheduled run dates and the 08:00/10:00 boundaries are computed on the server; a client cannot move a missed run into today's slot. Manual runs use separate keys and never satisfy a scheduled completion check.

Prices: null or positive integer GBP pence (maximum 100,000); grams: finite decimal >0 and <=10,000; pack count: integer 1–1,000. Non-single-bar/changed-weight observations may be saved but are quarantined. Title <=500 characters, evidence text <=8,000, offer wording <=2,000, URL <=2,048. No arbitrary URL fetching by the receiver. URLs must match the approved retailer source host/product identity and scope; redirects to a different listing require review. Oversized or malformed input returns VALIDATION_FAILED before inserts. Limits are versioned policy defaults.

Idempotency uniqueness is `(principal, tool, request_key)`. Store a hash of canonical validated input in the same transaction as facts. Identical retries return original IDs; changed content returns CONFLICT. Concurrent requests serialize on uniqueness/row locks. Exclude transport request IDs from the content hash. Creation receipts and replay metadata are distinct. Do not create new observation times on retries.

## Tools

| Tool | Required input beyond common fields | Result and invariants |
| --- | --- | --- |
| `start_run_v1` | request_key, trigger (`scheduled`/`manual`/`synthetic`), scheduled_for, collector_version, optional chatgpt_run_url | run_id, status, policy_version, server-approved source manifest, upload limits, cutoff_at. Server determines unique scheduled slot and expected sources. Repeat slot recovers existing run. Synthetic runs permanently excluded from the index. |
| `record_attempt_v1` | request_key, run_id, source_id, attempt_number, started_at, finished_at, outcome, availability, availability_observed_at, final_url, evidence_excerpt, optional bounded error and observation | attempt_id, optional observation_id, validation/review state and reasons, evidence_id. Source must belong to run manifest and principal. One transaction inserts attempt, optional immutable observation, initial review event and evidence reservation. |
| `reserve_evidence_v1` | request_key, run_id, attempt_id, evidence_id, optional observation_id, purpose, optional captured_at/MIME/byte_size/sha256, optional failure_code | reservation_id, evidence_id, state, accepted transfer method and limits. All IDs must belong to same attempt/run. A failed capture can reserve metadata with no fabricated file details. |
| `put_evidence_chunk_v1` | request_key, reservation_id, chunk_index, base64, chunk_sha256 | chunk receipt and received indexes. Initial proven transfer path: authenticated MCP chunks <=49,152 decoded bytes each (<=65,536 base64 chars). Server stores staging bytes in private Storage with paths derived from reservation; never accepts a client bucket/path. Identical chunk retry succeeds, conflicting bytes fail. |
| `finalise_evidence_v1` | request_key, reservation_id, total_chunks, total_bytes, sha256 | evidence_id, state, actual MIME/size/hash, stored_at or explicit failure. Reassemble ordered chunks, verify actual magic bytes/image decodability, total size/hash and reservation binding before private final upload. Mark stored only after read-back verification. Do not delete valid observation if image fails. |
| `finish_run_v1` | request_key, run_id | durable status, expected/attempted sources, valid/quarantined price counts, stored/missing evidence and alert IDs. Derive totals server-side; reject unaccounted required sources as complete. Complete means all source attempts accounted for, not all prices succeeded. Failed attempt outcomes or missing evidence remain visible. |
| `get_run_v1` | run_id OR scheduled_for (exactly one) | manifest, state, attempts and saved IDs, evidence status/hash, validation reasons, totals. No service secrets or reusable upload tokens. |
| `get_health_v1` | uk_date | server_now, expected_run, deadline, run presence/state, missing sources, evidence gaps, auth-grant expiry and actionable alert events. A missing run is a successful health query with explicit missing state, never a storage error. |
| `claim_alerts_v1` | request_key, consumer_id, limit (1–20) | pending event IDs, safe summary, severity, action, lease expiry. Monitor-only; scoped to approved consumer. |
| `ack_alert_v1` | request_key, event_id, lease_id, delivery_reference | delivered state. Acknowledgement means ChatGPT task output exists, not confirmed device push delivery. Expired leases retry; deduplication remains best effort across a crash between notification and acknowledgement. |

`observation` contains observed_at, product_title, source_url, pack_count, weight_g, currency=GBP, normal_price_pence, public_offer_price_pence, loyalty_price_pence, offer_conditions, offer_expiry_text, nullable offer_expires_at and price_evidence_text. At least one price is present. Only `price_observed` creates an observation. No-price/blocked/login_required/wrong_product/timeout/error attempts retain diagnostic evidence and never refresh an old observation. Availability is available/out_of_stock/unknown; blocked pages cannot establish stock. Date-only offer expiry maps to exclusive next UK midnight; ambiguous wording remains unknown. The stored policy determines >25% anomaly review against matching accepted baselines; exactly25% does not trigger. Collector cannot choose review outcome.

Corrections are operator-only append-only revisions, with supersedes ID, unchanged original observation time and a mandatory reason. A genuine later page visit is a new attempt and observation. Same-attempt composite foreign keys enforce price/evidence linkage.

## Image transfer and failure state

Use the proven authenticated byte transfer rather than assuming ChatGPT can send arbitrary authenticated HTTP requests or use signed upload URLs. Production chunking and assembly are **not yet proven** and must pass #6 before enabling collection. Ceiling: 5MiB per image, at most107 chunks of49,152 bytes, maximum two image reservations per attempt initially. Each request is bounded to100,000 bytes. A three-retailer run should normally use small readable JPEGs; the ceiling is not a target size. Server limits and backpressure apply regardless of what a model requests.

If implementation instead uses short-lived signed Storage uploads, #6 must first prove that exact cloud upload route end-to-end. Permission must bind one reserved object, expire within ten minutes, forbid overwrite and be refreshed without changing reservation identity. Never download arbitrary caller-supplied URLs server-side. Do not silently broaden this architecture to public buckets.

Evidence transitions: reserved -> uploading -> stored; capture_failed and upload_failed are distinct failure codes. Retry uses same reservation and preserved capture timestamp. Hash/MIME/size mismatch never becomes stored. Pending staging bytes expire after a24-hour grace period, only after a reference/in-flight check. Final evidence expiry uses captured_at + versioned365/30-day policy. Metadata/observations survive Storage deletion. Capture failure has no bytes to delete. Operator access to private evidence uses short-lived download links generated on demand.

## Errors and retries

Stable codes: UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, VALIDATION_FAILED, CONFLICT, RUN_CLOSED, CUTOFF_REACHED, RATE_LIMITED, UPLOAD_INCOMPLETE, HASH_MISMATCH, MIME_MISMATCH, SIZE_LIMIT, DEPENDENCY_UNAVAILABLE. Only RATE_LIMITED and transient DEPENDENCY_UNAVAILABLE are automatically retried; honor retry-after. At most three total transport/upload attempts using2s then8s backoff, bounded by deadline. One additional retailer visit after a failed visit; each visit is a separate attempt. Unknown write outcome is recovered through identical request_key/get_run, never by inventing a new observation.

## Failure notifications and independence

Proposed first release: separate ChatGPT cloud monitoring task reads health after the collector deadline. It must run even if the collector never starts. Run at10:00 Europe/London as specified in #7, independently of index calculation; declare missing and incomplete runs, expired grant, all-source failures and image gaps separately. Independent database detection may use Supabase Cron to materialize alert events; ChatGPT pulls those through monitor tools. This is independence from the collector process, **not** from ChatGPT/Supabase provider outages.

No arbitrary external-to-ChatGPT push endpoint has been established. Supported app event triggers are not a general webhook API. A separate-provider watchdog and out-of-band delivery would require another approved channel/service; do not silently introduce email, Slack or paid API delivery. Task output, device push and email are separate delivery claims and must be verified separately.

Alert event uniqueness `(kind, scheduled_slot, source_id-or-none, condition_version)` suppresses repeat condition events. Resolve only after healthy read-back; a new incident creates a new event. Monitoring auth/receiver failures must themselves surface as monitoring failures. Never interpret failed health requests as a healthy empty result. Exactly-once device delivery cannot be promised.

## Operating gates and costs

Existing probe grant expires23 October2026 at09:15:40 UTC. Do not extend or turn it into production access automatically. OAuth refresh belongs to ChatGPT/Supabase; expiry/revocation must result in visible failure and one-time owner reconnection when required. Natural expiry refresh has not been independently observed; successful calls over time do not establish which credential was refreshed. Rotation: new registered client/grant + consent, verify new connection, revoke old grant, retain audit history. Do not export tokens to test rotation.

No new paid service is enabled. Existing ChatGPT subscription usage/limits apply; no separate OpenAI API is used. Supabase free tier currently includes1GB Storage and500MB database. At the measured62,102-byte image size, three images daily for365days are about68MB raw bytes; at the5MiB cap they are about5.74GB. Diagnostics, staging, backups and transfer add usage. Thus the cap alone cannot ensure free-tier operation or the £10/month budget. Measure all three retailer screenshots and alert at80% allowance before enabling production; price paid alternatives explicitly if needed. Backups and a provider-independent watchdog remain separate release gates in #8/#7.

## Implementation acceptance handoff

#5: migrations, private bucket and role boundaries; enforce composite ownership and transaction/idempotency constraints.
#6: implement the tools, confirm chunk limits with actual cloud payloads, all-three persistence and two subsequent unattended days, interrupted upload/replay and read-back hashes.
#7: durable alerts and monitor task, missing-run/auth-failure tests, demonstrated user notification receipt and deduplication.
#8: cleanup/staging reconciliation, independent backup destination/cost and restore test.
#9: calculation reads accepted immutable observations only; no synthetic input, freshening by carry-forward or silent membership changes.

Sources checked16 October2026: [OpenAI plugin OAuth](https://developers.openai.com/plugins/build/auth), [ChatGPT task notifications and supported app events](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt), [Supabase OAuth flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows), [Supabase token security](https://supabase.com/docs/guides/auth/oauth-server/token-security), [Supabase pricing](https://supabase.com/pricing).
