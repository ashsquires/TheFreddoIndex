import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FREDDO_DATA, getComparison, getDisplayComparisons, formatPence } from '../freddo-data.js';
import { getCommodityRows } from '../retailer-data.js';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const snapshot = JSON.parse(readFileSync(new URL('../data/retailer-prices.json', import.meta.url), 'utf8'));

test('the complete price history is present before JavaScript executes', () => {
  const table = html.match(/<tbody id="price-table">([\s\S]*?)<\/tbody>/)[1];
  assert.equal((table.match(/<tr /g) ?? []).length, 32);
  for (const { year, price } of FREDDO_DATA.slice(0, -1)) {
    assert.ok(table.includes(`<th scope="row">${year}</th><td>${price}p</td><td>${formatPence(getComparison(year).inflationPrice)}</td>`));
  }
  const { ranked, averagePence } = getCommodityRows(snapshot);
  const latest = getDisplayComparisons(averagePence, ranked.length).at(-1);
  assert.ok(html.includes(`data-current-average="${latest.priceBasis === 'checked-average' ? averagePence : ''}" data-current-shops="${ranked.length}"`));
  const expectedPrice = latest.priceBasis === 'checked-average' ? `${formatPence(latest.price)} · checked average` : `${latest.price}p`;
  assert.ok(table.includes(`<th scope="row">2026</th><td>${expectedPrice}</td>`));
  assert.ok(html.includes(`id="recorded-price">${latest.price.toFixed(1).replace(/\.0$/, '')}<span>p</span>`));
  assert.ok(html.includes(`id="difference-price">+${Math.abs(latest.difference).toFixed(1)}<span>p</span>`));
});

test('structured site identity agrees with the canonical hostname', () => {
  const data = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const website = data['@graph'].find(item => item['@type'] === 'WebSite');
  assert.equal(website.name, 'The Original Freddo Index');
  assert.deepEqual(website.alternateName, ['The Freddo Index', 'Freddo Index']);
  assert.equal(website.url, 'https://thefreddoindex.com/');
  assert.match(html, /<link rel="canonical" href="https:\/\/thefreddoindex.com\/"/);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
});

test('the search icon is a real square PNG at a stable URL', () => {
  assert.match(html, /rel="icon"[^>]+href="\/assets\/favicon-frog-96.png"/);
  const png = readFileSync(new URL('../assets/favicon-frog-96.png', import.meta.url));
  assert.equal(png.readUInt32BE(16), 96);
  assert.equal(png.readUInt32BE(20), 96);
  const robots = readFileSync(new URL('../robots.txt', import.meta.url), 'utf8');
  assert.match(robots, /Sitemap: https:\/\/thefreddoindex.com\/sitemap.xml/);
  assert.doesNotMatch(robots, /Disallow:\s*\//);
});

test('the published page uses the dated snapshot and static email contact', () => {
  assert.match(html, /id="contact-form" action="mailto:thefreddoindex@gmail\.com"/);
  assert.match(html, /id="have-your-say"[^>]+href="#contact"/);
  assert.doesNotMatch(html, /src="\.\/comments\.js"/);
  assert.match(html, /September 2026 snapshot/);
  assert.doesNotMatch(html, />16 Sept(?:ember)? 2026</);
});
