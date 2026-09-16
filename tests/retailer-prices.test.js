import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { priceByWeight, pounds, getLeaderboard, getCommodityRows, copperComparison, benchmarkComparison, validateObservation, mergeObservations, MAX_PRICE_AGE_MS } from '../retailer-data.js';
import { renderLeaderboard, renderWeightComparison, renderCommodityIndex } from '../leaderboard-render.js';

const snapshot = JSON.parse(await readFile(new URL('../data/retailer-prices.json', import.meta.url)));
const now = Date.parse('2026-09-16T14:00:00Z');
const single = snapshot.observations.find(row => row.retailerId === 'sainsburys');
const isolated = observations => ({ ...snapshot, observations });

test('45p for 18g is £2.50/100g and £25/kg; multipacks use total weight', () => {
  assert.deepEqual(priceByWeight(45, 18), { perBarPence: 45, per100g: 2.5, perKg: 25 });
  assert.equal(priceByWeight(100, 18, 4).perBarPence, 25);
  assert.equal(pounds(priceByWeight(100, 18, 4).per100g), '£1.39');
  assert.equal(pounds(priceByWeight(34, 18).per100g), '£1.89');
  assert.equal(priceByWeight(34, 18).perKg, 34 / 18 * 10);
  for (const args of [[45, 0], [NaN, 18], [-1, 18], [45, 18, 0], [45, 18, 1.5]]) assert.throws(() => priceByWeight(...args));
});

test('ranks verified single bars only, with correct ties and no invented changes', () => {
  const result = getLeaderboard(snapshot, now);
  assert.deepEqual(result.ranked.map(row => [row.id, row.rank]), [['sainsburys', 1], ['tesco', 2], ['asda', 3]]);
  assert.equal(result.unranked[0].id, 'morrisons');
  assert.match(result.unranked[0].reason, /Multipack/);
  assert.ok(result.ranked.every(row => row.changePence === null));
  const tie = structuredClone(snapshot);
  tie.observations.find(row => row.retailerId === 'tesco').pricePence = 45;
  assert.deepEqual(getLeaderboard(tie, now).ranked.map(row => row.rank), [1, 1, 3]);
});

test('old, future, loyalty and unavailable observations cannot enter the ranking', () => {
  for (const row of [
    { ...single, checkedAt: new Date(now - MAX_PRICE_AGE_MS - 1).toISOString() },
    { ...single, checkedAt: new Date(now + 1).toISOString() },
    { ...single, priceType: 'loyalty' },
    { ...single, availability: 'unavailable' },
  ]) assert.equal(getLeaderboard({ ...isolated([row]), mode: 'live' }, now).ranked.length, 0);
  const stale = renderLeaderboard({ ...snapshot, mode: 'live' }, now + 3 * 86400000);
  assert.match(stale, /No comparable single-bar prices/);
  assert.doesNotMatch(stale, /Top of the shame table/);
  assert.equal(getLeaderboard(snapshot, now + 3 * 86400000).ranked.length, 3);
});

test('newest observation supersedes older price, even if newly unavailable', () => {
  const changed = { ...single, pricePence: 50, checkedAt: '2026-09-16T11:30:00Z' };
  const result = getLeaderboard(isolated([single, changed]), now);
  assert.equal(result.ranked[0].changePence, 5);
  assert.equal(getLeaderboard(isolated([single, { ...changed, availability: 'unavailable' }]), now).ranked.length, 0);
});

test('rejects unapproved URLs, currencies, weights and product variants', () => {
  for (const row of [
    { ...single, sourceUrl: 'javascript:alert(1)' }, { ...single, currency: 'EUR' },
    { ...single, weightGrams: 19.5 }, { ...single, productName: 'Freddo Caramel 18g' },
    { ...single, productName: 'Freddo Multipack 4 x 18g' }, { ...single, method: 'search-snippet' },
  ]) assert.throws(() => validateObservation(row));
});

test('copper comparison uses unrounded equal-weight prices, with dated expiry', () => {
  const comparison = copperComparison(single, snapshot.benchmarks.copper, now);
  assert.equal(comparison.ratio, 25 / 8.4);
  assert.equal(pounds(comparison.copperPer100g), '£0.84');
  assert.equal(comparison.ratio.toFixed(1), '3.0');
  assert.match(renderWeightComparison(snapshot, now), /About 2.5×/);
  const lower = { ...single, pricePence: 10 };
  assert.match(renderWeightComparison(isolated([lower]), now), /costs less/);
  assert.equal(copperComparison(single, { ...snapshot.benchmarks.copper, checkedAt: '2026-01-01T12:00:00Z' }, now), null);
  assert.equal(copperComparison(single, { ...snapshot.benchmarks.copper, pricePerKg: 0 }, now), null);
});

test('imports are idempotent, reject conflicting/future data and preserve history', () => {
  assert.equal(mergeObservations(snapshot, [single], now).observations.length, 4);
  assert.throws(() => mergeObservations(snapshot, [{ ...single, pricePence: 46 }], now), /Conflicting/);
  assert.throws(() => mergeObservations(snapshot, [{ ...single, checkedAt: '2027-01-01T00:00:00Z' }], now), /future/);
  const merged = mergeObservations(snapshot, [{ ...single, pricePence: 46, checkedAt: '2026-09-16T11:00:00Z' }], now);
  assert.equal(merged.observations.length, 5);
  assert.equal(snapshot.observations.length, 4);
});

test('lithium and lobster comparisons use the correct units and follow price changes', () => {
  assert.equal(benchmarkComparison(single, snapshot.benchmarks.lithium, now).ratio, 25 / 15.01);
  assert.equal(pounds(benchmarkComparison(single, snapshot.benchmarks.lobster, now).referencePer100g), '£2.67');
  const html = renderWeightComparison(snapshot, now);
  assert.match(html, /Pricier than lithium\. Still cheaper than lobster\./);
  assert.ok(html.includes(snapshot.benchmarks.lobster.sourceUrl.replaceAll('&', '&amp;')));
  assert.match(html, /shell-on · offer/);
  assert.match(renderWeightComparison(isolated([{ ...single, pricePence: 60 }]), now), /Now pricier than lobster/);
  assert.match(renderWeightComparison(isolated([{ ...single, pricePence: 20 }]), now), /Cheaper than lithium/);
  const equal = structuredClone(snapshot);
  equal.benchmarks.lithium.pricePerKg = equal.benchmarks.lobster.pricePerKg = getCommodityRows(snapshot, now).perKg;
  assert.match(renderWeightComparison(equal, now), /Level with lithium\. Level with lobster/);
});

test('stale reference dates and expired offers cannot support comparison claims', () => {
  const oldQuote = { ...snapshot.benchmarks.lithium, referenceDate: '2026-01-01' };
  assert.equal(benchmarkComparison(single, oldQuote, now), null);
  const later = now + 3 * 86400000;
  const refreshed = { ...snapshot, mode: 'live', observations: [{ ...single, checkedAt: new Date(later).toISOString() }] };
  const html = renderWeightComparison(refreshed, later);
  assert.match(html, /Pricier than lithium/);
  assert.doesNotMatch(html, /Still cheaper than lobster|£26.72/);
  assert.equal(benchmarkComparison(single, { ...snapshot.benchmarks.lithium, pricePerKg: NaN }, now), null);
  assert.equal(benchmarkComparison(single, snapshot.benchmarks.dairy_milk, now).referencePer100g, 1.682);
  assert.equal(benchmarkComparison(refreshed.observations[0], snapshot.benchmarks.dairy_milk, later), null);
});

test('source scope is escaped and retailer links remain attached to prices', () => {
  const html = renderLeaderboard({ ...snapshot, scope: '<img src=x onerror=alert(1)>' }, now);
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes(single.sourceUrl));
  assert.match(html, /static snapshot does not update automatically/);
});

test('commodity index averages eligible shops, expands from data and ranks using unrounded prices', () => {
  const result = getCommodityRows(snapshot, now);
  assert.equal(result.averagePence, 38);
  assert.equal(result.perKg, (45 + 35 + 34) / 3 * 10 / 18);
  assert.deepEqual(result.rows.map(row => row.id), ['lobster', 'freddo', 'dairy_milk', 'lithium', 'copper']);
  const expanded = structuredClone(snapshot);
  for (let i = 0; i < 6; i++) expanded.benchmarks[`test${i}`] = { ...snapshot.benchmarks.copper, name: `Test reference ${i}`, pricePerKg: 20 + i };
  expanded.benchmarks.test5.pricePerKg = result.perKg;
  const rows = getCommodityRows(expanded, now).rows;
  assert.equal(rows.length, 11);
  assert.equal(rows.find(row => row.id === 'freddo').rank, rows.find(row => row.id === 'test5').rank);
  assert.equal(rows.find(row => row.id === 'test0').icon, '🧵');
  const html = renderCommodityIndex(snapshot, now);
  assert.match(html, /£ \/ kg/);
  assert.match(html, /Cadbury Dairy Milk/);
  assert.match(html, /£16\.82/);
  assert.ok(html.includes(snapshot.benchmarks.dairy_milk.sourceUrl));
  assert.doesNotMatch(html, /<select/);
  assert.match(html, /September 2026 average · 3 supermarkets · 38p/);
  assert.match(html, /data-commodity="freddo"[\s\S]*?<td>£21.11<\/td>/);
  const withoutHighest = structuredClone(snapshot);
  withoutHighest.observations.find(row => row.retailerId === 'sainsburys').availability = 'unavailable';
  assert.equal(getCommodityRows(withoutHighest, now).averagePence, 34.5);
  assert.equal(getCommodityRows(snapshot, now + 3 * 86400000).rows.length, 5);
  assert.equal(getCommodityRows({ ...snapshot, mode: 'live' }, now + 3 * 86400000).rows.length, 0);
});
