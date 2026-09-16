import { renderLeaderboard, renderLatestPrices, renderPriceTicker, renderCommodityIndex } from './leaderboard-render.js';
import { getCommodityRows } from './retailer-data.js';

function enableTicker() {
  document.getElementById('price-ticker').dataset.animated = 'true';
}
enableTicker();

async function initPrices() {
  try {
    const response = await fetch('./data/retailer-prices.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Snapshot unavailable');
    const snapshot = await response.json();
    // Render with the current date so an old deployment cannot claim stale prices are fresh.
    const section = document.getElementById('leaderboard');
    function refresh() {
      section.innerHTML = renderLeaderboard(snapshot);
      document.getElementById('commodity-index').innerHTML = renderCommodityIndex(snapshot);
      document.getElementById('latest-retailer-prices').innerHTML = renderLatestPrices(snapshot);
      document.getElementById('price-ticker').innerHTML = renderPriceTicker(snapshot);
      enableTicker();
      const { ranked, averagePence } = getCommodityRows(snapshot);
      document.dispatchEvent(new CustomEvent('freddo:prices-updated', { detail: { averagePence, shopCount: ranked.length, displayPeriod: snapshot.displayPeriod } }));
    }
    refresh();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    // Refresh freshness when returning to the page, without disrupting a focused control.
  } catch {
    // Keep the source-linked build-time snapshot if its local JSON cannot load.
    document.getElementById('leaderboard-load-status').hidden = false;
    document.getElementById('latest-retailer-prices').innerHTML = '<p class="current-price-label">Current price</p><p class="current-price-note">Unable to refresh. See dated prices below.</p>';
  }
}
initPrices();
