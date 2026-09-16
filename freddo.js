import { CPI_DATA, CPI_SOURCE, BASELINE, getDisplayComparisons, getSummary, formatPence } from './freddo-data.js';

let rows = getDisplayComparisons(Number(document.body.dataset.currentAverage), Number(document.body.dataset.currentShops));
let pricePeriod = document.body.dataset.pricePeriod;
let selectedYear = rows.at(-1).year;
let chart = null;
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const el = id => document.getElementById(id);

function setPrice(id, value) {
  el(id).replaceChildren(document.createTextNode(value), Object.assign(document.createElement('span'), { textContent: 'p' }));
}

function differenceLabel(row) {
  return row.direction === 'equal' ? 'Exactly in line with inflation'
    : `${Math.abs(row.differencePercent).toFixed(0)}% ${row.direction} the inflation-only price`;
}

function selectYear(year) {
  const row = rows.find(item => item.year === year);
  const checkedAverage = row.priceBasis === 'checked-average';
  selectedYear = year;
  el('comparison-year').textContent = String(year);
  el('recorded-price-label').textContent = checkedAverage ? 'Checked average' : 'Recorded price';
  setPrice('recorded-price', checkedAverage ? row.price.toFixed(1).replace(/\.0$/, '') : String(row.price));
  el('recorded-price-note').textContent = checkedAverage ? `${row.shopCount} supermarket${row.shopCount === 1 ? '' : 's'} · ${pricePeriod || 'checked'} snapshot` : 'Approximate historical record';
  setPrice('inflation-price', row.inflationPrice.toFixed(1));
  setPrice('difference-price', `${row.direction === 'above' ? '+' : row.direction === 'below' ? '−' : ''}${Math.abs(row.difference).toFixed(1)}`);
  el('inflation-period').textContent = `10p in 1995 · CPI: ${row.cpi.period}`;
  el('difference-description').textContent = differenceLabel(row);
  const badge = Object.assign(document.createElement('span'), { className: 'year-badge', textContent: String(year) });
  const description = Object.assign(document.createElement('p'), {
    textContent: `${checkedAverage ? `The checked ${row.shopCount}-supermarket average is ${formatPence(row.price)}` : `Our approximate historical price is ${row.price}p`}. If it had followed inflation from ${BASELINE.year}, it would be ${formatPence(row.inflationPrice)}. ${row.direction === 'equal' ? 'This is our 10p starting point.' : `${formatPence(Math.abs(row.difference))} ${row.direction} the inflation-only price.`}`,
  });
  el('year-detail').replaceChildren(badge, description);
  for (const tableRow of el('price-table').rows) tableRow.dataset.selected = String(Number(tableRow.dataset.year) === year);
  if (chart) {
    chart.data.datasets[1].backgroundColor = barColors();
    chart.update('none');
  }
}

function barColors() {
  return rows.map(row => row.year === selectedYear ? '#330072' : row.price === BASELINE.price ? '#d8c7ec' : '#9973c4');
}

// Keep historical selection accessible without occupying the chart header.
el('freddoChart').addEventListener('keydown', event => {
  const index = rows.findIndex(row => row.year === selectedYear);
  const positions = { ArrowLeft: Math.max(0, index - 1), ArrowRight: Math.min(rows.length - 1, index + 1), Home: 0, End: rows.length - 1 };
  if (!(event.key in positions)) return;
  event.preventDefault();
  selectYear(rows[positions[event.key]].year);
});

function renderTable() {
  el('price-table').replaceChildren();
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.dataset.year = String(row.year);
    [row.year, row.priceBasis === 'checked-average' ? `${formatPence(row.price)} · checked average` : `${row.price}p`, formatPence(row.inflationPrice), `${row.difference > 0 ? '+' : ''}${formatPence(row.difference)}`, row.cpi.period].forEach((value, index) => {
      const cell = document.createElement(index === 0 ? 'th' : 'td');
      if (index === 0) cell.scope = 'row';
      cell.textContent = String(value);
      tr.append(cell);
    });
    el('price-table').append(tr);
  }
}
renderTable();

const summary = getSummary();
el('growth-stat').textContent = `${summary.growthPercent.toFixed(0)}%`;
el('growth-label').textContent = `Saved historical series growth since ${summary.startYear}`;
el('lowest-stat').textContent = `${summary.lowest}p`;
el('highest-stat').textContent = `${summary.highest}p`;
el('footer-year').textContent = String(new Date().getFullYear());
el('source-link').href = CPI_SOURCE.url;
const latestCpi = CPI_DATA.at(-1);
el('open-year').textContent = String(latestCpi.year);
el('latest-period').textContent = latestCpi.period;
el('snapshot-date').textContent = `CPI snapshot: ${new Date(`${CPI_SOURCE.retrieved}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })} · Updated manually`;
selectYear(selectedYear);

document.addEventListener('freddo:prices-updated', event => {
  const { averagePence = null, shopCount = 0, displayPeriod = pricePeriod } = event.detail || {};
  pricePeriod = displayPeriod;
  rows = getDisplayComparisons(averagePence, shopCount);
  const checkedAverage = rows.at(-1).priceBasis === 'checked-average';
  setPrice('hero-price', rows.at(-1).price.toFixed(1).replace(/\.0$/, ''));
  el('hero-price-basis').textContent = checkedAverage ? `${pricePeriod || 'Checked'} average` : 'Approximate historical price';
  el('hero-price-note').textContent = checkedAverage ? `${shopCount} supermarket${shopCount === 1 ? '' : 's'} · 18g single bars` : 'No comparable supermarket prices in this snapshot';
  el('chart-price-legend').textContent = checkedAverage ? 'Approximate history · 2026 checked average' : 'Approximate recorded price';
  el('chart-help').textContent = checkedAverage ? `2026 uses the ${shopCount}-supermarket average. Tap a bar or use ← → to explore.` : 'Tap a bar or use ← → to explore a year.';
  el('price-table-caption').textContent = checkedAverage ? 'Approximate historical Freddo prices; 2026 uses the checked supermarket average. Inflation is a hypothetical benchmark.' : 'Approximate Freddo prices and the hypothetical inflation benchmark';
  renderTable();
  if (chart) {
    chart.data.datasets[1].data = rows.map(row => row.price);
    chart.options.scales.y.suggestedMax = Math.ceil(Math.max(...rows.flatMap(row => [row.price, row.inflationPrice])) / 10) * 10;
  }
  selectYear(selectedYear);
});

function initChart() {
  if (!window.Chart) {
    el('freddoChart').hidden = true;
    el('chart-error').hidden = false;
    return;
  }
  chart = new window.Chart(el('freddoChart'), {
    type: 'bar',
    data: {
      labels: rows.map(row => String(row.year)),
      datasets: [
        {
          type: 'line', label: 'If it followed inflation',
          data: rows.map(row => row.inflationPrice),
          borderColor: '#237451', backgroundColor: '#237451',
          borderWidth: 2.5, borderDash: [6, 5], pointRadius: 0, pointHoverRadius: 4,
          pointHitRadius: 10, tension: 0, order: 0,
        },
        {
          type: 'bar', label: 'Freddo price', data: rows.map(row => row.price),
          backgroundColor: barColors(), hoverBackgroundColor: '#684194',
          borderRadius: 4, maxBarThickness: 23, categoryPercentage: 0.88,
          barPercentage: 0.9, order: 1,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: motionPreference.matches ? false : { duration: 450 },
      interaction: { mode: 'index', intersect: false },
      onClick(event) {
        const points = chart.getElementsAtEventForMode(event, 'index', { intersect: false }, false);
        if (points.length) selectYear(rows[points[0].index].year);
      },
      onHover(event, elements) {
        if (event.native?.target) event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#fff', titleColor: '#330072', bodyColor: '#4e425c',
          footerColor: '#756a81', borderColor: '#e3d8ee', borderWidth: 1,
          padding: 13, cornerRadius: 10, boxPadding: 5,
          titleFont: { family: 'Inter, Arial, sans-serif', weight: 'bold', size: 13 },
          bodyFont: { family: 'Inter, Arial, sans-serif', size: 11 },
          footerFont: { family: 'Inter, Arial, sans-serif', weight: 'normal', size: 10 },
          itemSort: (a, b) => b.datasetIndex - a.datasetIndex,
          callbacks: {
            label: context => context.dataset.type === 'bar'
              ? `${rows[context.dataIndex].priceBasis === 'checked-average' ? 'Checked supermarket average' : 'Approximate recorded price'}: ${formatPence(context.parsed.y)}`
              : `${context.dataset.label}: ${formatPence(context.parsed.y)}`,
            footer: items => `CPI: ${rows[items[0].dataIndex].cpi.period}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 9, color: '#82758e', font: { size: 10, family: 'Inter, Arial, sans-serif' } } },
        y: { beginAtZero: true, suggestedMax: Math.ceil(Math.max(...rows.flatMap(row => [row.price, row.inflationPrice])) / 10) * 10, border: { display: false }, grid: { color: '#f0ecf4' }, ticks: { stepSize: 10, padding: 8, color: '#82758e', font: { size: 10, family: 'Inter, Arial, sans-serif' }, callback: value => `${value}p` } },
      },
    },
  });
  motionPreference.addEventListener('change', event => {
    chart.options.animation = event.matches ? false : { duration: 450 };
    chart.update('none');
  });
}

// DOMContentLoaded waits for deferred scripts without waiting for analytics.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initChart, { once: true });
else initChart();
