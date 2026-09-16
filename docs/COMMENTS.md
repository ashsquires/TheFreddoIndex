# Moderated Freddo comments

This implementation is dormant. The public static page does not load `comments.js` or expose the moderated comment form. It uses an email-draft contact form instead; visitors send from their own email app to `thefreddoindex@gmail.com`. The instructions below apply only if comments are deliberately reactivated later.

## Status

Implemented locally; not provisioned or deployed. `comments-config.json` contains an empty endpoint, so the public page does not show an unusable form. The chosen working default is a nickname with no account, with every comment held for approval. This can be revised before launch.

The frontend remains on GitHub Pages. A separate Supabase project will provide PostgreSQL and one public `comments` Edge Function. Do not reuse the unrelated Windward project. Project ownership and cost must be agreed before provisioning.

## Local verification

`npm test` runs the actual migration in PGlite (PostgreSQL in-process) and tests row visibility, blocked public access, moderation, input validation, rate limits and queue bounds. HTTP handler tests cover CORS, payload size, error responses and sensitive-field exclusion. This verifies SQL behavior locally, not the hosted Supabase gateway or deployment.

`npm run preview:comments` starts an isolated preview on `http://127.0.0.1:4174/` after a production build. It uses an in-memory database and one clearly labelled preview comment. Submitted comments remain pending. Data is lost on restart; this is not a production server. The normal production preview keeps comments disabled until configured.

## Hosted setup

1. Choose a separate Supabase project and organization; confirm the actual quoted cost. Do not put any secret in the repository or a `VITE_` variable.
2. Apply `supabase/migrations/20260916101352_add_freddo_comments.sql` to that project. Verify all tables have RLS enabled, `anon` and `authenticated` have no table/function access, and only `service_role` can call the two RPCs. Run Supabase security advisors.
3. Set `COMMENT_RATE_LIMIT_SECRET` to a securely generated secret of at least 32 characters. Set `COMMENT_ALLOWED_ORIGINS=https://thefreddoindex.com`. The Edge Function uses the built-in server-only `SUPABASE_URL` and legacy `SUPABASE_SERVICE_ROLE_KEY` environment values. Never put those keys in browser code.
4. Deploy `supabase/functions/comments` using the checked-in config. `verify_jwt=false` is intentional for this public, account-free endpoint; all writes go through server validation and moderated SQL. The CORS allowlist is not authentication.
5. Smoke-test the actual endpoint: empty approved list; valid pending submission; no public visibility before approval; visibility after approval; rejection; invalid input; rate limit; allowed and disallowed origins. Review advisors again after setup.
6. Set `comments-config.json` to `{ "endpoint": "https://PROJECT_REF.supabase.co/functions/v1/comments" }`. This URL is public and contains no credentials. Build and publish the static site after the hosted checks pass.

## API

- `GET`: returns `{ comments: [{ id, name, body, createdAt }] }`, newest first, at most 50 approved comments. No pending/rejected content or anti-spam identifiers are returned.
- `POST`: accepts JSON `{ name, body, website }`. Nickname 2–40 characters; comment 3–1,000 characters; `website` is a hidden honeypot and should be blank. Request bodies are limited to 8 KiB. Successful submissions return 202 and await approval.
- 400 invalid comment; 413 oversized body; 415 wrong content type; 429 rate limit; 503 temporary backend problem. Drafts are preserved in the form on failure.
- UI content is inserted with `textContent`, never rendered as user HTML. URLs stay plain text.

## Moderation

In the Supabase Table Editor, open `freddo_comments` and filter `status = pending`. Read each comment before changing its status to `approved` or `rejected`. Approved content becomes public on the next list request. To withdraw a comment, set it to `rejected`. Public visitors cannot change status, read the queue or call the SQL RPCs directly. There is no public admin API and no moderator credential in the frontend.

Review the queue regularly. Remove spam and contact details; do not approve removal requests as public comments. Rejected content can be deleted through the dashboard according to the owner's retention policy. Set an actual moderation/retention practice before enabling comments; no email notification integration is included.

## Spam limits and privacy

Submission is serialized in PostgreSQL: maximum three accepted submissions per daily network fingerprint per ten minutes, 20 globally per minute, and 500 pending comments. The honeypot discards obvious automated submissions. Global and queue limits also apply when a caller changes network headers. These measures bound writes; they do not make a public endpoint immune to spam or denial of service. Consider a managed challenge if real abuse warrants it.

Raw IP addresses are not stored in the application database. The Edge Function HMACs a proxy-provided network address with a private secret and the current UTC date. Hashes are kept only in the rate-limit table and are not returned publicly. Records older than 24 hours are deleted on the next submission; they can remain longer during inactivity. Supabase/platform logs may separately record requests according to the provider's settings. Nicknames and comments are intentionally public after approval. No email address is collected.

## Dependency audit note

The dependency audit on September 2026 reported 12 advisories in the existing dependency tree (10 high, 1 moderate, 1 low), including Vite/build tooling and transitive packages. None were attributed to the newly added PGlite test dependency. No automatic dependency upgrades were applied as part of this SEO/comments change. This local verification is not a complete dependency security review; the hosted Edge Function uses standard Deno APIs and does not import the frontend npm dependency tree.
