import { getLeaderboard, priceByWeight, pounds, checkedDate, getCommodityRows } from './retailer-data.js';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const retailerLogos = { sainsburys: 'sainsburys.png', tesco: 'tesco.svg', asda: 'asda.avif', morrisons: 'morrisons.png' };
function sourceLink(url, label) {
  if (!url.startsWith('https://')) throw new Error('HTTPS source required');
  return `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)} <span aria-hidden="true">↗</span></a>`;
}
const time = row => `<time datetime="${escape(row.checkedAt)}">${checkedDate(row.checkedAt)}</time>`;

export function renderPriceTicker(snapshot, now = Date.now()) {
  const { ranked, unranked } = getLeaderboard(snapshot, now);
  const rows = [...ranked, ...unranked].filter(row => row.observation);
  const quotes = rows.map(row => {
    const observation = row.observation;
    const price = observation.packCount === 1 ? `${observation.pricePence}p` : `${pounds(observation.pricePence / 100)} / ${observation.packCount} pack`;
    const notes = [checkedDate(observation.checkedAt)];
    if (row.reason === 'Needs a fresh check') notes.push('needs recheck');
    if (observation.packCount > 1) notes.push('multipack');
    if (observation.priceType !== 'standard') notes.push(observation.priceType === 'loyalty' ? 'loyalty offer' : 'offer');
    if (observation.availability !== 'available') notes.push('availability unconfirmed');
    const change = row.changePence === null || row.changePence === 0 ? '' : `<span class="ticker-change">${row.changePence > 0 ? '↑' : '↓'} ${Math.abs(row.changePence)}p</span>`;
    return `<li><a href="${escape(row.url)}" target="_blank" rel="noopener noreferrer"><span class="ticker-logo"><img src="./assets/retailers/${retailerLogos[row.id]}" alt="${escape(row.name)}" width="72" height="32" /></span><span class="ticker-copy"><span class="ticker-quote-line"><strong>${price}</strong>${change}</span><small>${notes.join(' · ')}</small></span></a></li>`;
  }).join('') || '<li class="ticker-empty">Awaiting supermarket price checks</li>';
  // A visually identical second group makes the loop seamless. Its links are not tab stops.
  const duplicate = quotes.replaceAll('<a href=', '<a tabindex="-1" href=');
  return `<div class="shell price-ticker-inner"><a class="ticker-label" href="#leaderboard"><span>Freddo Exchange</span><small>${escape(snapshot.displayPeriod || 'Latest checks')} · 18g bars</small></a><div class="ticker-scroll" tabindex="0" role="region" aria-label="Supermarket prices. Moving prices pause on hover or focus."><div class="ticker-track"><ul class="ticker-quotes">${quotes}</ul><ul class="ticker-quotes ticker-duplicate" aria-hidden="true">${duplicate}</ul></div></div></div>`;
}

export function renderLatestPrices(snapshot, now = Date.now()) {
  const { ranked } = getLeaderboard(snapshot, now);
  if (!ranked.length) return '<p class="current-price-label">Price range</p><p class="current-price-note">Awaiting source checks</p>';
  const high = ranked[0].observation.pricePence;
  const low = ranked.at(-1).observation.pricePence;
  return `<p class="current-price-label">Price range</p><a href="#leaderboard" id="details-price" aria-label="${escape(snapshot.displayPeriod || 'Checked')} supermarket prices: ${low === high ? high : `${low} to ${high}`} pence. View sources.">${low === high ? high : `${low}–${high}`}<span>p</span></a><p class="current-price-note">18g · ${escape(snapshot.displayPeriod || checkedDate(ranked[0].observation.checkedAt))} snapshot</p>`;
}

export function renderCommodityIndex(snapshot, now = Date.now()) {
  const { ranked } = getLeaderboard(snapshot, now);
  const averagePence = ranked.length ? ranked.reduce((sum, row) => sum + row.observation.pricePence, 0) / ranked.length : null;
  return `<div class="commodity-heading"><p class="eyebrow">The pecking order</p><h2 id="commodity-title">Commodity Index<span class="brand-dot">.</span></h2><p>Same weight. Questionable priorities.</p></div>
    <p class="commodity-basis">${escape(snapshot.displayPeriod || 'Average checked price')} average${ranked.length ? ` · ${ranked.length} supermarkets · ${Number(averagePence.toFixed(1))}p` : ' · awaiting checks'}</p>
    <div id="weight-comparison" aria-live="polite">${renderWeightComparison(snapshot, now)}</div>`;
}

export function renderWeightComparison(snapshot, now = Date.now()) {
  const { ranked, averagePence, perKg, rows } = getCommodityRows(snapshot, now);
  if (!ranked.length) return '<p class="leaderboard-note">Weight comparisons return when the snapshot has a comparable single-bar price.</p>';
  const references = rows.filter(item => item.benchmark);
  const copper = references.find(reference => reference.id === 'copper');
  const lithium = references.find(reference => reference.id === 'lithium');
  const lobster = references.find(reference => reference.id === 'lobster');
  const copperText = copper ? (copper.comparison.ratio > 1 ? `About ${copper.comparison.ratio.toFixed(1)}× the price of scrap copper by weight.` : copper.comparison.ratio === 1 ? 'The frog and scrap copper are level by weight.' : 'For once, the frog costs less than scrap copper by weight.') : 'Chocolate economics, now by the kilo.';
  const headlines = [];
  if (lithium) headlines.push(lithium.comparison.ratio > 1 ? 'Pricier than lithium.' : lithium.comparison.ratio === 1 ? 'Level with lithium.' : 'Cheaper than lithium.');
  if (lobster) headlines.push(lobster.comparison.ratio < 1 ? 'Still cheaper than lobster.' : lobster.comparison.ratio === 1 ? 'Level with lobster. Fancy that.' : 'Now pricier than lobster. Fancy that.');
  const text = headlines.join(' ') || 'Small frog. Surprisingly serious price per kilo.';
  const extras = (snapshot.commodityExtras || []).map(item => `<tr class="commodity-joke"><th scope="row"><span class="commodity-item"><span class="commodity-icon" aria-hidden="true">${escape(item.icon || '✦')}</span><span>${escape(item.name)}<small>${escape(item.description || '')}</small></span></span></th><td>${escape(item.displayPrice)}</td></tr>`).join('');
  return `<table class="commodity-table"><caption class="sr-only">Commodity comparisons, highest price first. Freddo uses the average of ${ranked.length} comparable supermarket prices in the ${escape(snapshot.displayPeriod || 'saved')} snapshot. The priceless row is a joke, outside the numeric ranking.</caption><thead><tr><th scope="col">Item</th><th scope="col">£ / kg</th></tr></thead><tbody>${extras}${rows.map(item => `<tr class="${item.id === 'freddo' ? 'commodity-freddo' : ''}" data-commodity="${escape(item.id)}"><th scope="row"><span class="commodity-item"><span class="commodity-icon" aria-hidden="true">${escape(item.icon)}</span><span><span class="commodity-rank">${item.rank}.</span> ${escape(item.name)}<small>${escape(item.description)}</small></span></span></th><td>${pounds(item.perKg)}</td></tr>`).join('')}</tbody></table>
    <div class="commodity-verdict"><p>${text}</p><small>${copperText}</small></div>
    <details class="weight-method"><summary>Show the maths and sources</summary><p>One eligible standard 18g single-bar price per supermarket in this snapshot: ${ranked.map(row => `${row.observation.pricePence}p`).join(' + ')}. Their unweighted average is ${averagePence.toFixed(2)}p; ${averagePence.toFixed(2)}p ÷ 18g × 10 = ${pounds(perKg)} per kg. Calculations use the unrounded average. ${ranked.map(row => `${sourceLink(row.url, row.name)} (checked ${time(row.observation)})`).join('; ')}. Multipacks, offers and prices outside the snapshot window are excluded.</p>${references.map(({ benchmark }) => `<p>${escape(benchmark.name)} reference: ${sourceLink(benchmark.sourceUrl, benchmark.sourceName)}, checked ${checkedDate(benchmark.checkedAt)}. ${escape(benchmark.basis)}${benchmark.methodUrl ? ` ${sourceLink(benchmark.methodUrl, 'What this quote measures')}.` : ''}</p>`).join('')}<p>These are dated reference prices for perspective, not live feeds or interchangeable products. Eligibility was checked at the snapshot cut-off: commodity quotes within 30 days, retail prices and offers within 48 hours. Current prices may differ.</p></details>`;
}

export function renderLeaderboard(snapshot, now = Date.now()) {
  const { ranked, unranked } = getLeaderboard(snapshot, now);
  return `<div class="leaderboard-heading"><div><p class="eyebrow">The supermarket price watch</p><h2 id="leaderboard-title">The leaderboard of shame</h2><p>Same 18g frog. Different levels of cheek.</p></div><span class="preview-badge">${escape(snapshot.displayPeriod || 'Source-checking')} snapshot</span></div>
    <p class="leaderboard-note">Saved ${escape(snapshot.displayPeriod || 'dated')} page observations. This static snapshot does not update automatically. Only standard single-bar prices checked within 48 hours of the snapshot were ranked.</p>
    ${ranked.length ? `<div class="leaderboard-table-wrap" tabindex="0" role="region" aria-label="Supermarket single-bar prices"><table class="leaderboard-table"><caption>Highest price first · original milk-chocolate Freddo, 18g</caption><thead><tr><th scope="col">Rank / supermarket</th><th scope="col">One Freddo</th><th scope="col">Per 100g</th><th scope="col">Checked</th></tr></thead><tbody>${ranked.map(row => {
      const weight = priceByWeight(row.observation.pricePence, row.observation.weightGrams);
      return `<tr><th scope="row"><span class="shame-rank">${row.rank}</span><span class="retailer-identity"><img class="leaderboard-logo" src="./assets/retailers/${retailerLogos[row.id]}" alt="" width="68" height="30" />${sourceLink(row.url, row.name)}</span>${row.rank === 1 ? '<small class="shame-label">Top of the shame table</small>' : ''}<small class="mobile-checked">Checked ${time(row.observation)}</small></th><td class="retailer-price">${row.observation.pricePence}p<small>${row.changePence === null ? 'First observation' : row.changePence === 0 ? 'No change' : `${row.changePence > 0 ? '+' : '−'}${Math.abs(row.changePence)}p since last check`}</small></td><td>${pounds(weight.per100g)}</td><td>${time(row.observation)}</td></tr>`;
    }).join('')}</tbody></table></div>` : '<p class="leaderboard-empty" role="status">No comparable single-bar prices in this snapshot. Other observations are shown below.</p>'}
    ${unranked.length ? `<div class="unranked-prices">${unranked.map(row => `<p><strong><span class="retailer-identity"><img class="leaderboard-logo" src="./assets/retailers/${retailerLogos[row.id]}" alt="" width="68" height="30" />${sourceLink(row.url, row.name)}</span></strong> <span>${row.reason}</span>${row.observation ? `<small>Last observed: ${row.observation.packCount === 1 ? `${row.observation.pricePence}p for one bar` : `${pounds(row.observation.pricePence / 100)} for ${row.observation.packCount} × 18g · ${priceByWeight(row.observation.pricePence, 18, row.observation.packCount).perBarPence}p per bar · ${pounds(priceByWeight(row.observation.pricePence, 18, row.observation.packCount).per100g)} per 100g${row.observation.priceType === 'promotion' ? ' · promotional price' : ''}`} · ${time(row.observation)}</small>` : ''}</p>`).join('')}</div>` : ''}
    <p class="leaderboard-note">${escape(snapshot.scope)} Multipacks and loyalty offers do not enter the single-bar ranking. The 2026 chart point uses the eligible-shop average; earlier points are approximate historical records.</p>
`;
}
