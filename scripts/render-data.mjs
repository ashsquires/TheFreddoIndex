import { readFile, writeFile } from 'node:fs/promises';
import { CPI_SOURCE, getDisplayComparisons, formatPence } from '../freddo-data.js';
import { getCommodityRows } from '../retailer-data.js';

export function renderPriceRows(rows = getDisplayComparisons()) {
  return rows.map(row => {
    const price = row.priceBasis === 'checked-average' ? `${formatPence(row.price)} · checked average` : `${row.price}p`;
    return `<tr data-year="${row.year}"><th scope="row">${row.year}</th><td>${price}</td><td>${formatPence(row.inflationPrice)}</td><td>${row.difference > 0 ? '+' : ''}${formatPence(row.difference)}</td><td>${row.cpi.period}</td></tr>`;
  }).join('\n');
}

const path = new URL('../index.html', import.meta.url);
const source = await readFile(path, 'utf8');
const snapshot = JSON.parse(await readFile(new URL('../data/retailer-prices.json', import.meta.url), 'utf8'));
const { ranked, averagePence } = getCommodityRows(snapshot);
const rows = getDisplayComparisons(averagePence, ranked.length);
const latest = rows.at(-1);
const checkedAverage = latest.priceBasis === 'checked-average';
const marker = /<!-- PRICE_ROWS_START -->[\s\S]*?<!-- PRICE_ROWS_END -->/;
if (!marker.test(source)) throw new Error('Price table markers are missing from index.html');
let updated = source.replace(marker, `<!-- PRICE_ROWS_START -->\n${renderPriceRows(rows)}\n<!-- PRICE_ROWS_END -->`);
updated = updated.replace(/<body data-current-average="[^"]*" data-current-shops="[^"]*" data-price-period="[^"]*">/, `<body data-current-average="${checkedAverage ? averagePence : ''}" data-current-shops="${ranked.length}" data-price-period="${snapshot.displayPeriod || ''}">`);

function replaceById(id, html) {
  const expression = new RegExp(`(<([a-z][a-z0-9]*)\\b[^>]*\\bid="${id}"[^>]*>)[\\s\\S]*?(<\\/\\2>)`);
  if (!expression.test(updated)) throw new Error(`Missing #${id} in index.html`);
  updated = updated.replace(expression, (_, open, _tag, close) => `${open}${html}${close}`);
}

replaceById('chart-price-legend', checkedAverage ? 'Approximate history · 2026 checked average' : 'Approximate recorded price');
replaceById('hero-price', `${latest.price.toFixed(1).replace(/\.0$/, '')}<span>p</span>`);
replaceById('hero-price-basis', checkedAverage ? `${snapshot.displayPeriod || 'Checked'} average` : 'Approximate historical price');
replaceById('hero-price-note', checkedAverage ? `${ranked.length} supermarket${ranked.length === 1 ? '' : 's'} · 18g single bars` : 'No comparable supermarket prices in this snapshot');
replaceById('chart-help', checkedAverage ? `2026 uses the ${ranked.length}-supermarket average. Tap a bar or use ← → to explore.` : 'Tap a bar or use ← → to explore a year.');
replaceById('price-table-caption', checkedAverage ? 'Approximate historical Freddo prices; 2026 uses the checked supermarket average. Inflation is a hypothetical benchmark.' : 'Approximate Freddo prices and the hypothetical inflation benchmark');
replaceById('year-detail', `<span class="year-badge">${latest.year}</span><p>${checkedAverage ? `The checked ${ranked.length}-supermarket average is ${formatPence(latest.price)}` : `Our approximate historical price is ${latest.price}p`}. If it had followed inflation from 1995, it would be ${formatPence(latest.inflationPrice)}. ${formatPence(Math.abs(latest.difference))} ${latest.direction} the inflation-only price.</p>`);
replaceById('recorded-price-label', checkedAverage ? 'Checked average' : 'Recorded price');
replaceById('recorded-price', `${checkedAverage ? latest.price.toFixed(1).replace(/\.0$/, '') : latest.price}<span>p</span>`);
replaceById('recorded-price-note', checkedAverage ? `${ranked.length} supermarket${ranked.length === 1 ? '' : 's'} · ${snapshot.displayPeriod || 'checked'} snapshot` : 'Approximate historical record');
replaceById('inflation-price', `${latest.inflationPrice.toFixed(1)}<span>p</span>`);
replaceById('difference-price', `${latest.direction === 'above' ? '+' : latest.direction === 'below' ? '−' : ''}${Math.abs(latest.difference).toFixed(1)}<span>p</span>`);
replaceById('difference-description', `${Math.abs(latest.differencePercent).toFixed(0)}% ${latest.direction} the inflation-only price`);
replaceById('snapshot-date', `CPI snapshot: ${new Date(`${CPI_SOURCE.retrieved}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })} · Updated manually`);
replaceById('noscript-comparison', checkedAverage ? `The comparison above uses a saved ${ranked.length}-supermarket price snapshot; “View the numbers” contains the full history.` : 'The comparison above shows our saved 2026 historical figure; “View the numbers” contains the full history.');
if (source !== updated) await writeFile(path, updated);
