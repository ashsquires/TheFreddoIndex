import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FREDDO_DATA, CPI_DATA, BASELINE, getComparison, getDisplayComparisons, calculateComparison, formatPence, getSummary } from '../freddo-data.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`);

test('1995 is exactly the original 10p baseline', () => {
  const row = getComparison(1995);
  assert.equal(row.inflationPrice, 10);
  assert.equal(row.difference, 0);
  assert.equal(row.direction, 'equal');
  assert.equal(CPI_DATA[0].index, BASELINE.cpi);
});

test('completed years use their annual CPI index', () => {
  const row = getComparison(2025);
  near(row.inflationPrice, 20.595238095238095);
  assert.equal(formatPence(row.inflationPrice), '20.6p');
  assert.equal(row.cpi.frequency, 'annual');
  assert.equal(row.cpi.period, '2025 annual average');
});

test('2026 uses the labelled August monthly snapshot', () => {
  const row = getComparison(2026);
  assert.equal(row.price, 35);
  assert.equal(row.cpi.frequency, 'monthly');
  assert.equal(row.cpi.period, 'August 2026');
  near(row.inflationPrice, 21.369047619047617);
  near(row.difference, 13.630952380952383);
  assert.equal(formatPence(row.inflationPrice), '21.4p');
  assert.equal(formatPence(row.difference), '13.6p');
});

test('differences and percentages use unrounded prices', () => {
  const row = calculateComparison(35, 143.6);
  assert.notEqual(row.difference, 35 - Number(row.inflationPrice.toFixed(1)));
  near(row.differencePercent, 63.7883008356546);
  assert.equal(formatPence(1.26), '1.3p');
});

test('the affordable years are below, not above, the benchmark', () => {
  const row = getComparison(2006);
  assert.equal(row.direction, 'below');
  assert.ok(row.difference < 0);
  assert.equal(formatPence(row.difference), '-1.9p');
});

test('all original prices are unchanged and have exactly one CPI observation', () => {
  const original = readFileSync(new URL('../constants.ts', import.meta.url), 'utf8');
  const oldPrices = [...original.matchAll(/year: (\d+), price: (\d+)/g)].map(match => ({ year: Number(match[1]), price: Number(match[2]) }));
  assert.deepEqual(FREDDO_DATA, oldPrices);
  assert.equal(FREDDO_DATA.length, 32);
  for (const row of FREDDO_DATA) {
    assert.equal(CPI_DATA.filter(cpi => cpi.year === row.year).length, 1);
    assert.ok(Number.isFinite(getComparison(row.year).inflationPrice));
  }
});

test('summary statistics describe Freddo price growth', () => {
  assert.deepEqual(getSummary(), { startYear: 1995, endYear: 2026, growthPercent: 250, lowest: 10, highest: 35 });
});

test('the current checked average changes only the displayed 2026 point', () => {
  const rows = getDisplayComparisons(38, 3);
  assert.equal(rows.at(-1).price, 38);
  assert.equal(rows.at(-1).shopCount, 3);
  assert.equal(rows.at(-1).priceBasis, 'checked-average');
  assert.equal(formatPence(rows.at(-1).difference), '16.6p');
  assert.equal(rows.find(row => row.year === 2025).price, 35);
  assert.equal(getComparison(2026).price, 35);
  assert.equal(getDisplayComparisons(null, 0).at(-1).price, 35);
  assert.equal(getDisplayComparisons(38, 0).at(-1).price, 35);
});

test('missing years and invalid indices fail explicitly', () => {
  assert.throws(() => getComparison(2027), RangeError);
  assert.throws(() => calculateComparison(35, 0), RangeError);
  assert.throws(() => calculateComparison(35, NaN), RangeError);
});
