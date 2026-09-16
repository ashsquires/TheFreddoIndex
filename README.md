# The Original Freddo Index

A playful comparison of approximate UK Freddo prices and what the original 10p price would have become if it had followed CPI inflation from 1995.

## Run and verify

Requires Node.js 20+.

```sh
npm install
npm run dev
npm test
npm run build
npm run preview
```

The active site is a standalone HTML page, CSS and browser JavaScript. The price comparison requires no API key or backend. The public contact form opens a pre-addressed draft in the visitor’s email app; the visitor must press Send there. An earlier moderated-comments backend remains in the repository but is not connected to the public page. The site can be served directly from the repository root by a static host, or built with Vite and served from `dist/`. Building alone does not publish the site.

`index.html` loads `styles.css`, `freddo.js` and a pinned Chart.js 4.5.1 CDN script. `freddo.js` uses `freddo-data.js` for the shared price history, CPI snapshot and calculations. The older React/TypeScript files are inactive and are not the page entry point. Google Fonts and the existing Google Analytics property remain in use. If the chart CDN fails, the accessible data table remains available.

## Inflation methodology

- Baseline: 10p in 1995; annual CPI index 67.2.
- Formula: `10 × comparison CPI / 67.2` (pence).
- Source: [ONS CPI all items, series D7BT, 2015 = 100](https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7bt/mm23).
- Completed years: ONS annual average indices.
- 2026: August monthly index 143.6, from the September 2026 release. This is explicitly labelled as a monthly observation, not a full-year average.
- The snapshot was retrieved in September 2026. It is stored locally and updated manually; visitors do not fetch CPI data.
- Differences and percentages use unrounded calculations. Calculated prices display one decimal place; percentages display whole numbers.
- Freddo prices remain the original approximate history, not live retailer quotes. The CPI comparison is hypothetical, not a recommended retail price. The branding does not imply this website existed in 1995.

## Updating the data

1. Read the current ONS D7BT release. Update annual indices in `CPI_DATA` in `freddo-data.js` from its annual table. Use the same index series and base for every observation.
2. Update the open year's monthly entry with the latest published month and its actual index. Keep `period` and `frequency` accurate. Once its annual average is available, replace the monthly entry with an annual entry. Never invent or extrapolate an index for a missing year.
3. Update `CPI_SOURCE.releaseDate` and `retrieved`. If ONS revises or rebases the series, update the full snapshot and `BASELINE.cpi` together.
4. Only change `FREDDO_DATA` when intentionally revising the historical price records. Every price year must have exactly one CPI observation. The preservation test compares the current history against the original `constants.ts` archive; update that test deliberately if price revisions are authorised later.
5. For retailer updates, verify source pages, append dated observations, then set `snapshotAt` to the actual cut-off after those checks and update `displayPeriod`. Eligibility is measured at that cut-off, so a static deployment remains an honest dated snapshot rather than losing all prices after 48 hours. Run `node scripts/render-data.mjs` to regenerate the no-JavaScript price table and 2026 comparison. It also runs before development and production builds. The browser reads the same local snapshot and falls back to the 35p historical entry when no comparable quotes qualified at the cut-off.
6. Run `npm test` and `npm run build`, then check desktop and mobile layouts, chart clicks and arrow-key selection, the data table and CPI period labels in a browser. Deploy through the existing static-hosting workflow when authorised.

## Accessibility

The focusable chart supports Left/Right to select adjacent years and Home/End for the first/latest year, alongside chart clicks. A collapsible data table exposes every value and CPI period. Changes update live comparison summaries. Chart animation follows the reduced-motion system preference.

## SEO and contact

- [SEO review and launch checklist](docs/SEO_REVIEW.md): verified live findings, implemented changes, intended search appearance and ranking measurement.
- [Dormant comments implementation](docs/COMMENTS.md): backend code retained for a possible future moderated feature; the public page uses email contact.
- Crawlable favicon PNGs and the social share card are committed in `assets/`. The favicon uses the frog from the site's logo; `scripts/create-brand-assets.py` can recreate the icon sizes from `assets/freddo-frog-icon-master.png` on macOS with Pillow. Builds use the committed files and do not require Python.
- The supplied transparent `assets/freddo-index-logo.png` is the header logo. The hero’s People’s Economic Indicator tile matches the Commodity Index width and uses the same checked supermarket average, falling back to the labelled historical price when no current quotes qualify.
- `comments-config.json` remains empty and the page does not load the comments client. Contact messages stay in the visitor’s email app until they choose to send them to `thefreddoindex@gmail.com`.

## Latest price and reactions card

The reaction stays fixed when users explore historical years. The chart’s top-right Price Range shows the September 2026 supermarket observations. The 2026 graph point and inflation comparison use their equal-shop average; 1995–2025 use approximate historical prices. The original 35p 2026 entry remains unchanged in `freddo-data.js` and is used when the snapshot has no comparable quotes. “Have your say” links to the static email contact form. The Freddo FAQ section has been removed at the owner's request.

## Supermarket price snapshot

The leaderboard, Commodity Index and 2026 graph point use the same eligible retailer quotes in `data/retailer-prices.json`; historical entries and CPI remain separate. `retailer-data.js` holds validation, ranking, cut-off eligibility and weight calculations. `leaderboard-render.js` is shared by browser code and the build-time HTML renderer, so the saved observations and sources remain visible without JavaScript. The browser reads only our local September 2026 snapshot, never supermarket sites. The build copies `data/` into `dist/`.

A stock-market-style “Freddo Exchange” strip beneath the header uses the same observations. It links to supermarket sources, includes check dates and explicitly labels Morrisons’ multipack offer. Prices move left in a seamless 32-second loop with hover pause. The strip uses logos instead of repeated retailer names; meaningful image alt text retains accessible names. There is no pause button. Keyboard focus, reduced-motion preferences and no-JavaScript use get a still, scrollable list; duplicate quotes are hidden from assistive technology and the tab order. Movement arrows appear only when an actual previous comparable observation supports a change.

Retailer logos are stored in `assets/retailers/`, with source details in `SOURCES.md`. Ticker logos carry retailer alt text; supermarket leaderboard logos are decorative beside the retailer names. The repeated animation group is hidden from screen readers.

See [source checks, collection workflow and backend plan](docs/PRICE_WATCH.md). Three single-bar prices were verified in the browser in September 2026; Morrisons' observed multipack is excluded. Daily collection and hosted price storage are not enabled. Copper, a lithium carbonate quote labelled Lithium, Cadbury Dairy Milk and whole lobster provide dated price-per-kilogram references, with source details. The Commodity Index uses the unweighted average of the comparable single-bar quote from each supermarket at the saved cut-off. These are dated snapshots, not live feeds.

```sh
npm run prices:check
npm run prices:import -- /path/to/observations.json
# After reviewing source evidence:
npm run prices:import -- /path/to/observations.json --write
npm run build
```

### Commodity Index

The right-hand sidebar contains a ranked table with an icon per item and a pale-purple Freddo row; Reactions sits beneath it. The table always uses £/kg and averages one comparable single-bar quote per supermarket at the snapshot cut-off. With the saved 45p, 35p and 34p observations, the average is 38p or £21.11/kg. Morrisons’ promotional multipack is excluded. The comparison also includes a Tesco Cadbury Dairy Milk 110g bar at its £1.85 standard price (£16.82/kg), kept separate from Freddo observations. It qualified within 48 hours of the saved cut-off; its price may have changed since. The 2026 graph point and three inflation figures use the same 38p average (21.4p inflation benchmark, 16.6p difference), while the history highlight strip continues to describe the untouched approximate historical series (250% growth, 35p highest). The old year selector and date-range badge have been removed; arrow-key chart navigation replaces the selector.

To add sourced comparison items, add a uniquely keyed object to `benchmarks` in `data/retailer-prices.json`, with `name`, `displayName`, `icon` (text/emoji), `description`, `currency: "GBP"`, positive `pricePerKg`, `checkedAt`, `sourceName`, `sourceUrl` (HTTPS), and `basis`. Include `referenceDate` for published quotes and `priceType: "promotion"` or `"retail"` for references that must be checked within 48 hours of the snapshot cut-off. The table discovers and sorts all valid entries, including ten or more items, without renderer changes. Monetary ties receive the same rank. Add only prices verified from their source; no placeholder price rows are shown. `commodityExtras` holds explicitly non-priced joke rows such as “My father’s approval — Priceless”, outside the numeric ranking. Run the tests and build after edits.
