// Shared by the static renderer, browser and source-checking scripts.
export const MAX_PRICE_AGE_MS = 48 * 60 * 60 * 1000;
export const MAX_REFERENCE_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const RETAILERS = Object.freeze([
  { id: 'sainsburys', name: 'Sainsbury’s', url: 'https://www.sainsburys.co.uk/groceries/product/cadbury-dairy-milk-freddo-chocolate-bar-18g' },
  { id: 'tesco', name: 'Tesco', url: 'https://www.tesco.com/shop/en-GB/products/275341411' },
  { id: 'asda', name: 'ASDA', url: 'https://www.asda.com/groceries/product/5803656' },
  { id: 'morrisons', name: 'Morrisons', url: 'https://groceries.morrisons.com/products/cadbury-dairy-milk-freddo-chocolate-bar-4-pack-multipack/115225381' },
]);

export function priceByWeight(pricePence, weightGrams, packCount = 1) {
  if (!Number.isSafeInteger(pricePence) || pricePence <= 0 || !Number.isFinite(weightGrams) || weightGrams <= 0 || !Number.isSafeInteger(packCount) || packCount < 1) {
    throw new Error('Positive pence, grams and pack count are required');
  }
  const per100g = pricePence / (weightGrams * packCount);
  return { perBarPence: pricePence / packCount, per100g, perKg: per100g * 10 };
}

export const pounds = value => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);
export const checkedDate = value => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'Europe/London' }).format(new Date(value));

export function validateObservation(row) {
  const retailer = RETAILERS.find(source => source.id === row.retailerId);
  if (!retailer || row.sourceUrl !== retailer.url) throw new Error('Unknown retailer or unapproved source URL');
  if (!Number.isFinite(Date.parse(row.checkedAt))) throw new Error('A valid check timestamp is required');
  if (row.currency !== 'GBP' || row.variant !== 'milk-chocolate' || row.weightGrams !== 18) throw new Error('Wrong currency, variant or bar weight');
  priceByWeight(row.pricePence, row.weightGrams, row.packCount);
  if (row.pricePence > 10000) throw new Error('Price requires review');
  if (!['standard', 'promotion', 'loyalty'].includes(row.priceType)) throw new Error('Unknown price type');
  if (!['available', 'unavailable', 'unknown'].includes(row.availability)) throw new Error('Unknown availability');
  if (!['browser-verified', 'structured-data'].includes(row.method)) throw new Error('Direct source verification is required');
  if (typeof row.evidence !== 'string' || row.evidence.length < 10 || row.evidence.length > 1000) throw new Error('A short product/price evidence excerpt is required');
  if (!/freddo/i.test(row.productName ?? '') || /caramel|friends|faces/i.test(row.productName)) throw new Error('Not the original Freddo');
  if (row.packCount === 1 && /multipack|\b\d+\s*(?:x|pack)\b/i.test(row.productName)) throw new Error('Multipack cannot be recorded as one bar');
  return row;
}

// Agent/browser imports never overwrite history or silently rewrite an earlier observation.
export function mergeObservations(snapshot, incoming, now = Date.now()) {
  if (!Array.isArray(incoming) || !incoming.length || incoming.length > 20) throw new Error('Import 1–20 observations');
  const observations = [...snapshot.observations];
  for (const input of incoming) {
    const row = validateObservation(input);
    if (Date.parse(row.checkedAt) > Number(now)) throw new Error('Check timestamp is in the future');
    const same = observations.find(old => old.retailerId === row.retailerId && old.checkedAt === row.checkedAt);
    if (same) {
      if (['pricePence', 'packCount', 'weightGrams', 'priceType', 'availability', 'sourceUrl'].some(key => same[key] !== row[key])) throw new Error('Conflicting observation at an existing timestamp');
      continue;
    }
    observations.push(row);
  }
  return { ...snapshot, observations };
}

export function isFresh(checkedAt, now = Date.now(), maxAge = MAX_PRICE_AGE_MS) {
  const age = Number(now) - Date.parse(checkedAt);
  return Number.isFinite(age) && age >= 0 && age <= maxAge;
}

// Published static pages describe a dated snapshot. Evaluate source eligibility
// at its recorded cut-off so an old deployment does not silently lose its chart.
export function evaluationTime(snapshot, now = Date.now()) {
  if (snapshot.mode !== 'snapshot') return now;
  const at = Date.parse(snapshot.snapshotAt);
  if (!Number.isFinite(at)) throw new Error('Snapshot cut-off time is required');
  return at;
}

export function getLeaderboard(snapshot, now = Date.now()) {
  const asOf = evaluationTime(snapshot, now);
  const current = RETAILERS.map(retailer => {
    const observations = snapshot.observations.filter(row => row.retailerId === retailer.id).map(validateObservation)
      .sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt));
    const latest = observations[0];
    let reason = 'Awaiting a verified price';
    if (latest) {
      if (!isFresh(latest.checkedAt, asOf)) reason = 'Needs a fresh check';
      else if (latest.packCount !== 1) reason = 'Multipack only · not ranked';
      else if (latest.priceType !== 'standard') reason = 'Offer price · not ranked';
      else if (latest.availability !== 'available') reason = 'Availability unconfirmed · not ranked';
      else reason = null;
    }
    const previous = observations.slice(1).find(row => row.packCount === 1 && row.priceType === 'standard' && row.availability === 'available');
    return { ...retailer, observation: latest, reason, changePence: !reason && previous ? latest.pricePence - previous.pricePence : null };
  });
  const ranked = current.filter(row => !row.reason).sort((a, b) => b.observation.pricePence - a.observation.pricePence || a.name.localeCompare(b.name));
  for (let i = 0; i < ranked.length; i++) {
    ranked[i].rank = i && ranked[i].observation.pricePence === ranked[i - 1].observation.pricePence ? ranked[i - 1].rank : i + 1;
  }
  return { ranked, unranked: current.filter(row => row.reason) };
}

export function benchmarkComparison(observation, benchmark, now = Date.now()) {
  const maxAge = ['promotion', 'retail'].includes(benchmark?.priceType) ? MAX_PRICE_AGE_MS : MAX_REFERENCE_AGE_MS;
  if (!benchmark || benchmark.currency !== 'GBP' || !Number.isFinite(benchmark.pricePerKg) || benchmark.pricePerKg <= 0 ||
      !isFresh(benchmark.checkedAt, now, maxAge) || !isFresh(observation.checkedAt, now) ||
      (benchmark.referenceDate && !isFresh(benchmark.referenceDate, now, maxAge))) return null;
  const price = priceByWeight(observation.pricePence, observation.weightGrams, observation.packCount);
  return { ...price, ratio: price.perKg / benchmark.pricePerKg, referencePer100g: benchmark.pricePerKg / 10 };
}

export function copperComparison(observation, benchmark, now = Date.now()) {
  const result = benchmarkComparison(observation, benchmark, now);
  return result && { ...result, copperPer100g: result.referencePer100g };
}

// One equally weighted, comparable single-bar quote per retailer; no multipack or offer substitutions.
export function getCommodityRows(snapshot, now = Date.now()) {
  const asOf = evaluationTime(snapshot, now);
  const { ranked } = getLeaderboard(snapshot, asOf);
  if (!ranked.length) return { ranked, averagePence: null, perKg: null, rows: [] };
  const averagePence = ranked.reduce((total, row) => total + row.observation.pricePence, 0) / ranked.length;
  const perKg = ranked.reduce((total, row) => total + priceByWeight(row.observation.pricePence, row.observation.weightGrams).perKg, 0) / ranked.length;
  const rows = Object.entries(snapshot.benchmarks || {}).flatMap(([id, benchmark]) => {
    const reference = benchmarkComparison(ranked[0].observation, benchmark, asOf);
    return reference ? [{ id, name: benchmark.displayName || benchmark.name, icon: benchmark.icon || '◈', description: benchmark.description || 'Dated reference', perKg: benchmark.pricePerKg, benchmark, comparison: { ...reference, ratio: perKg / benchmark.pricePerKg } }] : [];
  });
  rows.push({ id: 'freddo', name: 'Freddo', icon: '🐸', description: `${ranked.length}-shop average · ${Number(averagePence.toFixed(1))}p / 18g`, perKg });
  rows.sort((a, b) => b.perKg - a.perKg || a.name.localeCompare(b.name));
  rows.forEach((row, i) => { row.rank = i && row.perKg === rows[i - 1].perKg ? rows[i - 1].rank : i + 1; });
  return { ranked, averagePence, perKg, rows };
}
