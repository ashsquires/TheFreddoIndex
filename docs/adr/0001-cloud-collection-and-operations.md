# Cloud collection and independent operations

Status: implementation prepared; production activation pending. Decision date: 16 October 2026.

Use the existing ChatGPT cloud schedule at 08:00 Europe/London for browser collection from ASDA, Tesco and Sainsbury's. A separate production OAuth client connects it to a narrow Supabase MCP receiver. The probe client does not gain production powers.

Use Supabase Cron as a five-minute wakeup for operational work. Determine the 10:00 UK cutoff in PostgreSQL, not with a fixed UTC assumption. Monitoring, index calculation, evidence cleanup and email delivery have separate failure handling. This is independent of the collector and ChatGPT provider, but not of a complete Supabase outage.

Use GitHub Actions for encrypted logical backups outside Supabase, using a dedicated export-only endpoint and public-key encryption. The private recovery key never enters the runner. This adds no paid service when within existing quotas. At most eleven retained backups of up to20MiB consume about220MiB before temporary overlap, against GitHub Free's500MB included Actions storage; account-wide usage must be checked. Supabase Free has500,000 monthly Edge invocations; five-minute maintenance adds about8,928 in a31-day month. These are capacity estimates, not measured invoices.

Image bytes are not backed up in this first implementation. The backup manifest identifies which evidence should exist, but cannot recreate deleted images. The original screenshot retention policy remains365/30 days. Measured original test JPEG was62,102 bytes; three per day for365days is about68MB, while three5MiB images daily would exceed the free allowance. Warn at80%, propose readable JPEG compression, and do not silently shorten retention or upgrade.

Index memberships bind an approved source version as well as retailer/product. A new postcode/login/listing scope cannot silently replace a qualified source. Membership requires seven immediately preceding valid UK dates and an operator decision. Normal and public offer prices retain their own observed timestamps; loyalty-only checks neither supply nor freshen the public index.

Sources checked16 October2026: [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [Supabase Edge pricing](https://supabase.com/docs/guides/functions/pricing), [Supabase scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions).
