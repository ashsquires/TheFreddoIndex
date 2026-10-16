# Cloud ingestion feasibility — issue #4

Status: **manual and scheduled authenticated screenshot round-trips passed after explicit persistent browser permission; remaining #4 checks are open**.
Checked 16 October 2026. This report is evidence for [#4](https://github.com/ashsquires/TheFreddoIndex/issues/4), not a claim that production ingestion has been implemented. Keep #4 open and downstream deployment blocked until the remaining acceptance checks pass. Earlier sections below preserve the initial investigation; the dated updates supersede their setup status.

## Actual cloud check

A read-only capability check was submitted in the existing daily task's ChatGPT web context. This was a manually initiated follow-up, not an unattended scheduled invocation.

- Task: `6acfbd68ef908190b1123f2a6249fdf3`, daily 08:00 Europe/London.
- [Capability-check conversation](https://chatgpt.com/c/6ad1147b-298c-83ed-87e7-b86e5ad74f09).
- Report's self-generated identifier: `freddo-ticket4-capcheck-2026-10-15T17:59:56.239Z`. This is not a platform-generated run ID.
- The cloud agent reported an OpenAI-managed Work sandbox and a cloud browser identified as `cdp` in its documentation. The local browser was used to submit/read the check, not to execute retailer collection or a receiving service.
- The report said no Freddo receiver or general authenticated HTTP request tool was exposed; Supabase was not installed in that cloud environment. This does not imply Supabase is unavailable to other chats or the desktop session.
- Library upload/read tools were available for ChatGPT Library, not a verified Supabase transfer route. No bytes were uploaded during this check.
- No custom-receiver OAuth/secret provisioning interface or independent-watchdog notification endpoint was exposed.
- No Supabase project was accessed, and no credentials, connections, tables or schedules were changed. The task still displayed daily 08:00 scheduling.

Local supporting evidence is in ignored `reports.local/auth-probe/cloud-capabilities.txt` and `cloud-capabilities.png`; the conversation link above is the durable reference. Tool availability is the cloud agent's report, not a receiver-side authentication test.

## What documentation establishes

[Scheduled tasks](https://learn.chatgpt.com/docs/automations) can use connected tools available to their cloud chat. This supports investigating a custom connection; it does not establish this account's permissions or unattended write behavior.

[Plugin authentication](https://developers.openai.com/plugins/build/auth) documents OAuth-protected MCP resources, authorization-code flow with PKCE, discovery metadata and audience/scope checks. A hosted, narrowly scoped MCP receiver is therefore a candidate. It is **not yet selected or tested** for this deployment.

[Connecting and testing plugins](https://developers.openai.com/plugins/deploy/connect-chatgpt) is the setup reference. Account eligibility and connection controls must be checked in the user's cloud account. A Supabase dashboard browser login is not a collector credential. Do not install the broad Supabase administration connector as a substitute for a restricted ingestion identity.

## Next setup work

1. Verify the cloud account can connect a custom hosted MCP service with managed OAuth. Select a compatible authorization provider and HTTPS host, checking actual cost before deployment. Prefer the existing Freddo infrastructure where compatible; do not introduce a paid API or local runtime implicitly.
2. Build a synthetic-only receiver with `probe:write` and `probe:read` authority. Pin its server-side destination to `ectikpmaidqobqfsqife` and a separate probe namespace. Do not accept a caller-supplied project, arbitrary SQL, external fetch URL or production object path.
3. Configure OAuth discovery, resource audience, scopes and refresh/revocation behavior. Keep server credentials in managed secrets. Complete the one-time user connection only once the exact access grant is reviewable.
4. Verify manual cloud authentication and binary round-trip. Only then arrange a later scheduled probe, recording its platform run link and receiver evidence. Preserve the existing collection prompt and disable any temporary test schedule afterwards.
5. Test a notification route independently. One candidate is a separate cloud ChatGPT watchdog that reads receiving-service status; this avoids assuming a general external push API exists. It still requires capability and delivery testing and does not establish independence from a ChatGPT-wide outage.

No new service cost has been incurred. Hosting, authorization-provider, storage and usage costs remain unmeasured; the £10/month ceiling is a constraint, not a demonstrated estimate.

## Probe acceptance matrix

| Check | Required proof | Current result |
| --- | --- | --- |
| Manual authenticated write | Receiver identity, request ID and synthetic record | Passed from cloud chat; private user namespace confirmed in Storage |
| Binary round-trip | Cloud-generated bytes, saved object, downloaded bytes and matching SHA-256 | Passed with original 62,102-byte JPEG; see 16 October update |
| Later unattended invocation | Schedule/run link and receiver timestamp, no human clicks | Passed on the one-off retry after explicit persistent browser permission; see retry evidence below |
| Invalid/revoked credential | Request denied; no object or record written | Missing/invalid credentials denied; disabled server grant denied live, then restored without extending expiry |
| Wrong scope/audience/namespace | Rejection before storage access | Not run |
| Token refresh and rotation | Behavior across expiry; revoked identity stays rejected | Not run |
| Independent notification | Deliberately missed synthetic run causes one delivered alert | Not run |

For binary testing, use a small synthetic PNG and a unique probe ID. Replaying the same request must return the same saved identity; different bytes under that ID must conflict. Record hashes and byte counts, never tokens or signed upload credentials. An application-only hash response without downloading and hashing the stored bytes is insufficient.

The production contract (start/recover run, record attempt, reserve upload, finalise evidence, finish/read run) remains pending transport selection. Do not describe provisional schemas or a locally mocked receiver as a proven production contract. The absence of a current connection is a setup gap, not proof that ChatGPT cannot support this architecture.

## Resume and tracker status

GitHub's connector returned HTTP 403 when attempting to assign #4; assignment subsequently succeeded through the signed-in browser. A findings comment was submitted there, with acceptance boxes left unchecked. The next implementation step is custom-connection eligibility and receiver/auth-provider setup, followed by the actual probe—not building production tables or claiming the six-ticket backlog complete.

Repository verification: `npx tsc --noEmit` fails on five existing `Deno` global references in the unchanged comments Edge Function. This documentation-only investigation does not change that function or its runtime configuration.

## Receiver implementation — 16 October 2026

The `freddo-probe` Edge Function is now deployed to the personal Freddo project. The probe-only migration has been applied through the dashboard and private `freddo-auth-probes` storage exists (65,536-byte limit, application/octet-stream, zero client policies). No production price tables were created.

Transport candidate: stateless MCP Streamable HTTP, protocol 2025-03-26, JSON responses. `initialize`, `ping`, `tools/list`, `tools/call` are supported. Tools are `probe_put({probe_id,base64})` and `probe_get({probe_id})`; IDs are 1–80 ASCII letters/digits/underscore/hyphen, requests capped at100,000 bytes, decoded files at65,536 bytes. Results include ID, byte count and SHA-256; reads include stored bytes. Identical replay succeeds; conflicting bytes cannot overwrite. Storage paths are server-derived from the verified user ID. No arbitrary project, URL, SQL or path inputs exist.

Auth design: Supabase managed authorization-code/PKCE OAuth; explicit user consent; manually registered ChatGPT client; dynamic registration disabled. Signed JWTs must have the personal project issuer, receiver-specific audience, authenticated role, unexpired timestamp, client ID and session ID. A server-only RPC checks a live session and an enabled user/client grant with explicit expiry. A token hook sets the resource audience for registered probe clients. Empty allowlist means nobody has access. Service credentials stay in Supabase's function environment.

Supabase's `email` OAuth scope describes identity disclosure, **not** receiver permissions. It does not provide custom probe scopes. Receiver authority is instead the private user/client allowlist, tested at the request and SQL boundary. Do not claim an OAuth scope-rejection test has passed. See [Supabase token security](https://supabase.com/docs/guides/auth/oauth-server/token-security) and [OAuth setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started). The OAuth service is free during beta; hosting remains on the existing free project. No paid plan enabled; actual long-term cost is not yet measured.

The user approved enabling OAuth, the exact consent page at `https://thefreddoindex.com/oauth-consent.html`, replacement of legacy gateway verification with the receiver's custom validation, and a seven-day restricted test connection. A broader wildcard redirect was rejected by automatic approval review; the exact address is used instead. The consent page keeps the authorization request in tab session storage across email sign-in, refuses framed execution, and requires an explicit Allow action. Open the email link in the same tab.

Implementation validation: 53 tests passed initially (8 new probe tests), website TypeScript check and separate Deno receiver check passed, production website build passed. A live discovery request exposed Supabase's internally rewritten URL; a regression test now covers both gateway paths and the routing fix is deployed. These are not authenticated cloud-run evidence. Connection, real token refresh/revocation, manual binary round-trip, later unattended invocation, notifications and production contract remain pending. Keep #4 open.

Live setup update (16 October 2026): OAuth is enabled with dynamic registration off. The exact consent redirect is configured and the consent page is published. ChatGPT successfully discovered the endpoints and initiated authorization through the manually registered public PKCE client. OIDC identity expansion was disabled; email is the only requested identity scope. The token hook is enabled. The email sign-in link was sent to the project owner's Freddo mailbox; user sign-in is required before the cloud round-trip can run. The approved user/client grant expires at 2026-10-23 09:15:40 UTC (10:15:40 UK time).

The receiver's discovery endpoint returned HTTP200 at09:04:07 UTC (Supabase request `01a143f4-4d90-7700-95ce-f11858944412`). Deliberately missing and invalid credentials returned HTTP401 with OAuth discovery challenges (requests `01a143fa-62cd-7445-98b7-f806f8cad485` and `01a143fa-63c0-7164-a173-8febb5a9cd12`). These were network checks from the development session, not scheduled ChatGPT probes. The dashboard editor initially appended code during a replacement; the duplicated source was backed up, replaced atomically via the editor, and exact source equality verified before redeployment. The startup fault is resolved.

Refresh/revocation operating procedure: ChatGPT owns its OAuth tokens; Supabase owns signing and refresh issuance. Never copy tokens into prompts. Disable the private user/client grant to immediately deny receiver calls, or revoke the OAuth grant/session in Supabase. Allowlist expiry provides a seven-day trial stop independent of token expiry. Rotation requires replacing the registered client and grant, then reconnecting; do not extend an existing trial automatically. These are implemented controls/procedures, not yet live revocation/refresh proof.

## Authenticated cloud screenshot test — 16 October 2026

The owner completed email sign-in and consent. The connected plugin is `Freddo collection test` (`plugin_asdk_app_6ad1ea294d6481919f9fa30a2d390cd0`). [Cloud test conversation](https://chatgpt.com/c/6ad1f3f3-d670-83eb-b41e-659bf8b41dbb).

- Text probe `freddo-cloud-20261016-a`: cloud `probe_put` and `probe_get` succeeded with five bytes (`hello`), SHA256 `2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824`.
- Browser screenshot probe `freddo-cloud-png-20261016-a`: **actual format is JPEG**, despite the ID retained from the initial PNG request. The cloud browser captured `https://example.com`; native screenshot bytes were preserved, not converted or fabricated. Size 62,102 bytes; SHA256 `1b439ab10abf25a6dc0a08b6cfa4826c1de719ecf8df6955d27adea59fc1a472`.
- Cloud upload and read-back returned `isError: false`. The cloud agent independently decoded and hashed the returned bytes, reporting exact byte equality with its original screenshot. Both tool operations are recorded in that conversation.
- Separately verified in the personal project's private Storage bucket: `fb99ddb0-4537-46e3-a826-c26a71f13def/freddo-cloud-png-20261016-a.bin`, displayed size 60.65 KB, added/modified 16 October 2026 11:03:45 UK (10:03:45 UTC). The bucket remains private, with no client policies.
- The browser initially refused a data URL; the test switched to an ordinary public HTTPS page. Opening example.com required a chat-specific browser approval, which was granted for the manual test. This is **not evidence of unattended browser permission**. No broad all-sites permission was granted.
- One intermediate cloud turn ended without a final response; follow-up confirmed no upload had run, then completed the round-trip. The successful result must not be attributed to that empty turn.

Temporary one-off cloud schedule: [Freddo unattended screenshot probe](https://chatgpt.com/scheduled?automationId=6ad1f61ce2a48190a992387dcd80e3e8&automationSource=cloud), 16 October 2026 11:15 UK (10:15 UTC), repeat disabled. It first writes/reads the five-byte test, then attempts a real JPEG or PNG screenshot round-trip. The daily 08:00 task is unchanged. The one-off schedule now displays Completed and has no future recurrence.

Evidence snapshots are retained locally in ignored `reports.local/auth-probe/`. No tokens, service keys or signed upload URLs were copied into reports or prompts. Only the personal Freddo Supabase project was accessed. Foreign-audience rejection, natural token-expiry refresh behavior, independent watchdog notification and the versioned production contract remain unfinished; #4 stays open.

Additional live checks: identical five-byte replay returned the same ID/hash; conflicting bytes returned `INVALID_ARGUMENT` with a conflict message and did not overwrite the original. A `../foreign-project` ID was rejected by connector schema validation, so this is input validation evidence, not a live foreign-audience test.

The private grant was temporarily disabled for a live denial check, then restored with the original expiry unchanged. A cloud `probe_put` for `freddo-revoked-20261016-a` was denied with `UNAUTHORIZED`, reason `run_with_credentials_failed_to_invoke_with_refreshed_token`; ChatGPT displayed a reconnect prompt. Read-only Storage SQL confirmed only the earlier text and screenshot objects existed, with no revoked-test object. This verifies server-grant revocation; it does not prove OAuth session deletion or natural token-expiry refresh behavior. After restoration, one cloud `probe_get` succeeded using the existing connection, without reauthentication. The expired-connection message was therefore how ChatGPT presented the deliberate authorization denial, not evidence that the original token had naturally expired.

### Scheduled result: browser permission blocks unattended screenshots

[Actual scheduled-run conversation](https://chatgpt.com/c/6ad1f84c-3ac4-83eb-8f9a-e248f3a6acc3). The run created `freddo-scheduled-hello-20261016-a.bin` in the restricted user namespace (five bytes); database `created_at` is **2026-10-16 10:11:42.986457 UTC**. This precedes the displayed 10:15 UTC schedule time; record both observed values rather than claiming exact scheduler timing. No Run-now command or manual prompt was sent to this run.

The cloud run then paused at **“Allow ChatGPT to access example.com with the cloud browser?”**, offering Allow for this chat, Allow all relevant sites, or Deny. No option was clicked during the scheduled run. The earlier manual chat's domain approval did not carry into this new run. No scheduled screenshot object was present in the receiver check. Scheduler Completed means the one-off trigger is finished, not that all requested operations succeeded.

This proves unattended restricted receiver invocation for the small text write, but **does not pass unattended screenshot acceptance**. The live result is preserved at the approval prompt. A persistent browser-domain authorization mechanism must be established and retested; the broad all-relevant-sites option was not enabled implicitly. An independent notification test and production contract remain outstanding. Keep #4 open and downstream deployment blocked.

### Scheduled retry passed after approved persistent browser access

The owner explicitly approved **Allow all relevant sites**, including the broader automatic website-access scope. The confirmation was accepted before creating this retry. The earlier paused run is human-assisted if it resumes; it is not the evidence for this pass.

A separate one-off task, **Freddo unattended screenshot retry**, was created through the cloud chat for 16 October 2026 at 12:39:21 BST (11:39:21 UTC), repeat off. Its configuration and completion result are in the [cloud conversation](https://chatgpt.com/c/6ad1f3f3-d670-83eb-b41e-659bf8b41dbb). The setup turn only read an existing probe and created the schedule. No Run-now command, follow-up execution prompt, login or browser/write approval was supplied to the retry. The completed one-off has no future recurrence; the daily 08:00 task is unchanged.

Read-only SQL independently confirmed these new objects in the private probe bucket and restricted user namespace:

| Probe | Storage creation time (UTC) | Bytes |
| --- | --- | --- |
| `freddo-scheduled-hello-20261016-b` | 2026-10-16 11:37:03.893851 | 5 |
| `freddo-scheduled-image-20261016-b` | 2026-10-16 11:37:41.272915 | 62,102 |

The run reported all four put/get calls successful, a fresh JPEG screenshot of example.com at 11:37:27 UTC, read-back at 11:37:47 and independent byte/hash comparison at 11:37:53. Original screenshot, receiver and decoded download hashes matched: `1b439ab10abf25a6dc0a08b6cfa4826c1de719ecf8df6955d27adea59fc1a472`. The actual JPEG bytes were preserved. No per-run intervention occurred. Storage timestamps again precede the displayed schedule time, so exact scheduler timing remains an observed discrepancy, not a precision guarantee.

This passes the restricted unattended screenshot transport probe. It does not establish supermarket accessibility, production-sized image support, long-term reliability, natural token refresh, independent watchdog notifications or the production ingestion contract. Keep #4 open for its remaining acceptance work. The seven-day restricted grant expiry is unchanged. Local evidence: `reports.local/auth-probe/scheduled-retry-pass.png` and `.txt` (ignored).

## Authentication boundaries and production design — 16 October 2026

Selected transport and the versioned production tool contract are specified in [INGESTION_CONTRACT_V1.md](INGESTION_CONTRACT_V1.md). The contract covers run/attempt identity, transactional price/evidence links, authenticated chunk upload, verification, replay conflicts, permissions, errors, health and alerts. Production deployment is #5/#6, not a capability already supplied by the probe. In particular, 5MiB chunk assembly remains an integration acceptance test; only64KiB probe transfer is proven.

Additional automated receiver-boundary tests exercise foreign issuer/audience, expired/missing identity claims, verification failure, cross-user same-ID isolation and rejected project/bucket/path overrides. They assert no unauthorized storage access. These inject verified claims at the verifier seam and do not constitute a live foreign-signed JWT test. Existing database tests verify private grants, deleted sessions and denied public role access. The live invalid/missing-token and revoked-grant checks above provide network/cloud evidence. Natural token refresh and client rotation have not been independently observed; the explicit limitation is retained rather than inferred from successful later calls. No tokens were extracted and no additional authority was granted.

An independent one-off ChatGPT watchdog (`6ad21080066481919cc93fadd88401ba`, displayed11:57:40 UTC) checked an intentionally absent synthetic completion marker. At11:56:28 UTC it returned an actionable monitoring-failure message because the receiver collapsed missing-object errors into generic failures. This was useful failure-path evidence, not successful missing-run detection. The adapter now maps only explicit NoSuchKey or legacy Object not found responses to absence; authorization, missing bucket and service errors remain failures. The fix is deployed to the personal probe and covered by regression tests. All57 repository tests passed after the change.

The independent task uses the same ChatGPT platform as collection; it is not protection against a ChatGPT-wide outage. No general external notification endpoint was verified. Official [ChatGPT task documentation](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt) describes task push/email settings and supported app events. In-chat output does not prove device delivery. User receipt verification remains required before claiming push/email delivery. The original daily task remains unchanged; test tasks are one-off and do not create ongoing monitors.

Live extra-field test limitation: asking the cloud connector to add `project_id: other-project` to an existing probe read returned the original Freddo object's bytes. This does not prove server rejection: the connector may strip unknown fields before invocation. The receiver's exact code rejects extra fields and never accepts a selectable project; automated boundary tests prove that behavior at the receiver seam. Do not label the cloud call a successful foreign-resource rejection or evidence of access to another project. The normal existing-object read after deployment also passed.
