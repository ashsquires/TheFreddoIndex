# SEO review — The Original Freddo Index

Reviewed September 2026. Target searches: **freddo index** and **the freddo index**, primarily UK Google users.

## Finding and goal

The live website still serves the old page. The local facelift and this SEO work have not been published. Google cannot discover these improvements until they are deployed and recrawled. First place is the goal, not a result that code or metadata can guarantee.

The supplied screenshot shows a generic globe, the plain title “The Freddo Index”, and a snippet assembled from navigation and page copy. A more useful intended appearance is:

**The Original Freddo Index | Prices & Inflation**

Remember 10p Freddos? Explore Freddo prices since 1995, compare them with UK inflation, and see what your chocolate frog would cost. The Original Freddo Index.

Google chooses the final title and snippet for each query. The frog favicon is eligible only after crawling; the social share card is for link previews, not a guaranteed Google search image.

## Verified live-site audit

| Area | Live finding | Local change / next step |
| --- | --- | --- |
| Hosting and availability | HTTPS homepage returns 200 from GitHub Pages | Preserve current hosting |
| Host consolidation | HTTP and HTTPS `www` both redirect with 301 to `https://thefreddoindex.com/` | Already correct |
| Homepage title | “The Freddo Index” | More descriptive, brand-led title |
| Meta description | Missing on the old page | Distinct, descriptive copy matching the page |
| Search icon | No crawlable favicon in the old page; facelift used an inline emoji | Original frog PNG at a stable URL, also preserved in Vite output |
| Canonical | Missing on the old page | Explicit canonical to the HTTPS apex domain |
| Site identity | No JSON-LD | `WebSite` with preferred name and alternate names; matching `WebPage` |
| Crawl files | `robots.txt` and `sitemap.xml` both return 404 | Add both; include them in the production build |
| Useful text content | Chart-led page with little explanation | Add a clear definition and three useful questions, preserving the playful design |
| Price table | Old page had no table; facelift populated it only with JavaScript | Generate all 32 rows into the HTML before deployment |
| Search snippet quality | Old snippet includes incidental UI copy | Better description, visible explanatory copy, `data-nosnippet` on fictional quote and comments |
| Sharing | No representative share image | 1200×630 local PNG, Open Graph and Twitter metadata |

A missing robots file or sitemap does not itself prevent indexing, and adding them is not a ranking boost. They make crawl intent and canonical URLs explicit. No `meta keywords`, fabricated ratings or inappropriate FAQ rich-result markup were added.

## Ranking strategy

1. **Publish the completed page**, then verify the public title, description, icon, canonical, sitemap and all asset responses. Preserve the current domain and working redirects.
2. **Use Google Search Console for the domain.** Inspect the homepage, run the live URL test, request indexing once, and submit `/sitemap.xml`. Review Google's chosen canonical and any indexing problems. Account access and Search Console data were not inspected in this review.
3. **Measure the right queries.** Filter the Performance report to UK Web searches and `^(the )?freddo index$`. Record impressions, clicks, CTR and average position for 28 days, then compare the next 28 days after recrawling. Average position is not a universal, fixed ranking.
4. **Earn relevant links and mentions.** The inflation comparison and downloadable/shareable chart are the useful story. Pursue genuine links from UK personal-finance writers, economics educators and publications covering Freddo prices; do not buy links or post promotional spam. No outreach has been sent.
5. **Maintain accuracy and usefulness.** Update the CPI snapshot when new figures are published, keep its month visible and clearly separate approximate historical Freddo prices from the dated September 2026 retailer snapshot. The requested historical prices are unchanged.
6. **Keep a single strong landing page for the two target phrases.** Do not create duplicate pages for “freddo index” and “the freddo index”. Additional pages should answer genuinely different questions with original, sourced content.
7. **Monitor experience after launch.** Use Search Console Core Web Vitals and PageSpeed Insights; no production field performance score is claimed here. The price table and explanatory text work without chart rendering.

Other sites appearing in the research included freddoindex.com, Vouchercloud's Freddo comparison and Full Fact's Freddo/inflation article. This was competitor discovery, not a measured Google ranking report. No authenticated rank, backlink or Search Console dataset was available.

## Comments and SEO

Comments are a community feature, not a guaranteed ranking improvement. The prepared implementation uses nicknames, manual approval, database rate limits and plain-text rendering. Only approved comments are returned publicly; HTML and links are not activated. Comments are excluded from search snippets so spam or jokes cannot replace the main description. No comment content is seeded into the production database.

The comments endpoint is intentionally unconfigured until a separate backend is provisioned. The only discovered hosted Supabase project was Windward, which has not been modified. See `COMMENTS.md` for setup and moderation.

## Sources

- [Google: title links](https://developers.google.com/search/docs/appearance/title-link)
- [Google: snippets and meta descriptions](https://developers.google.com/search/docs/appearance/snippet)
- [Google: favicon requirements](https://developers.google.com/search/docs/appearance/favicon-in-search)
- [Google: site names](https://developers.google.com/search/docs/appearance/site-names)
- [Google: getting your site on Search](https://developers.google.com/search/docs/fundamentals/get-on-google)
- [Competitor](https://freddoindex.com/)
- [Full Fact's comparison](https://fullfact.org/online/freddos-vs-inflation/)

## Subsequent owner edits

The owner requested removal of the Freddo definition/FAQ section. The structured metadata, crawl files and static price table remain. The reaction is independent of historical year selection and links to a static email-draft contact form. Its header shows the range from separately verified, dated supermarket observations; the earlier owner-supplied blanket 35p attribution was removed. The leaderboard is rendered into HTML with source links and per-100g prices. It is a September 2026 snapshot, not an automated live feed; see [PRICE_WATCH.md](PRICE_WATCH.md).
