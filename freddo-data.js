// Approximate historical prices, preserved from the original standalone page.
export const FREDDO_DATA = [
  [1995, 10], [1996, 10], [1997, 10], [1998, 10], [1999, 10],
  [2000, 10], [2001, 10], [2002, 10], [2003, 10], [2004, 10],
  [2005, 10], [2006, 10], [2007, 15], [2008, 15], [2009, 15],
  [2010, 15], [2011, 17], [2012, 20], [2013, 20], [2014, 20],
  [2015, 25], [2016, 25], [2017, 30], [2018, 25], [2019, 30],
  [2020, 30], [2021, 30], [2022, 30], [2023, 30], [2024, 35],
  [2025, 35], [2026, 35],
].map(([year, price]) => ({ year, price }));

export const CPI_SOURCE = {
  name: 'Office for National Statistics',
  series: 'D7BT — CPI all items (2015 = 100)',
  url: 'https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7bt/mm23',
  retrieved: '2026-09-16',
  releaseDate: '2026-09-16',
};

// Completed years use ONS annual averages. The open year uses a labelled
// monthly observation, never a forecast or an assumed full-year average.
export const CPI_DATA = [
  [1995, 67.2], [1996, 68.8], [1997, 70.1], [1998, 71.2], [1999, 72.1],
  [2000, 72.7], [2001, 73.6], [2002, 74.5], [2003, 75.5], [2004, 76.5],
  [2005, 78.1], [2006, 79.9], [2007, 81.8], [2008, 84.7], [2009, 86.6],
  [2010, 89.4], [2011, 93.4], [2012, 96.1], [2013, 98.5], [2014, 100.0],
  [2015, 100.0], [2016, 100.7], [2017, 103.4], [2018, 105.9], [2019, 107.8],
  [2020, 108.7], [2021, 111.6], [2022, 121.7], [2023, 130.5],
  [2024, 133.9], [2025, 138.4],
].map(([year, index]) => ({ year, index, period: `${year} annual average`, frequency: 'annual' }));
CPI_DATA.push({ year: 2026, index: 143.6, period: 'August 2026', frequency: 'monthly' });

export const BASELINE = { year: 1995, price: 10, cpi: 67.2 };

export function calculateComparison(price, cpi, baseline = BASELINE) {
  if (![price, cpi, baseline.price, baseline.cpi].every(Number.isFinite)
      || price < 0 || cpi <= 0 || baseline.price <= 0 || baseline.cpi <= 0) {
    throw new RangeError('Prices must be non-negative and CPI indices must be positive.');
  }
  const inflationPrice = baseline.price * cpi / baseline.cpi;
  const difference = price - inflationPrice;
  return {
    inflationPrice,
    difference,
    differencePercent: difference / inflationPrice * 100,
    direction: Math.abs(difference) < 1e-9 ? 'equal' : difference > 0 ? 'above' : 'below',
  };
}

export function getComparison(year) {
  const freddo = FREDDO_DATA.find(row => row.year === year);
  const cpi = CPI_DATA.find(row => row.year === year);
  if (!freddo || !cpi) throw new RangeError(`No complete comparison for ${year}`);
  return { ...freddo, cpi, ...calculateComparison(freddo.price, cpi.index) };
}

// The current checked average is a display overlay, never a rewrite of the
// approximate historical series. An absent average falls back to that record.
export function getDisplayComparisons(currentAveragePence = null, shopCount = 0) {
  const latestYear = FREDDO_DATA.at(-1).year;
  return FREDDO_DATA.map(({ year }) => {
    const historical = getComparison(year);
    if (year !== latestYear || !Number.isFinite(currentAveragePence) || currentAveragePence <= 0 || shopCount < 1) return historical;
    return { ...historical, price: currentAveragePence, shopCount,
      priceBasis: 'checked-average', ...calculateComparison(currentAveragePence, historical.cpi.index) };
  });
}

export function formatPence(value) {
  return `${value.toFixed(1)}p`;
}

export function getSummary() {
  const prices = FREDDO_DATA.map(row => row.price);
  const first = FREDDO_DATA[0];
  const latest = FREDDO_DATA.at(-1);
  return {
    startYear: first.year,
    endYear: latest.year,
    growthPercent: (latest.price - first.price) / first.price * 100,
    lowest: Math.min(...prices),
    highest: Math.max(...prices),
  };
}
