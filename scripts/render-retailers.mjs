import { readFile, writeFile } from 'node:fs/promises';
import { renderLeaderboard, renderLatestPrices, renderPriceTicker, renderCommodityIndex } from '../leaderboard-render.js';

const snapshot = JSON.parse(await readFile(new URL('../data/retailer-prices.json', import.meta.url), 'utf8'));
const path = new URL('../index.html', import.meta.url);
let html = await readFile(path, 'utf8');
const now = Date.now();
for (const [name, content] of [['COMMODITY_INDEX', renderCommodityIndex(snapshot, now)], ['LEADERBOARD', renderLeaderboard(snapshot, now)], ['LATEST_RETAILERS', renderLatestPrices(snapshot, now)], ['PRICE_TICKER', renderPriceTicker(snapshot, now)]]) {
  const marker = new RegExp(`<!-- ${name}_START -->[\\s\\S]*?<!-- ${name}_END -->`);
  if (!marker.test(html)) throw new Error(`${name} markers missing`);
  html = html.replace(marker, () => `<!-- ${name}_START -->\n${content}\n<!-- ${name}_END -->`);
}
await writeFile(path, html);
