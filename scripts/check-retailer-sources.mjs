// Diagnostic only: a fetch succeeding is not sufficient evidence to publish a price.
// Fixed public URLs, bounded bodies, no login/cookie reuse, no challenge bypass.
import { mkdir, writeFile } from 'node:fs/promises';
import { RETAILERS } from '../retailer-data.js';

const checks = [];
for (const retailer of RETAILERS) {
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(retailer.url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      checks.push({ retailerId: retailer.id, url: retailer.url, checkedAt, status: response.status, result: 'browser-check-required' });
      await response.body?.cancel();
      continue;
    }
    let size = 0;
    let html = '';
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 2_000_000) throw new Error('Response exceeds size limit');
      html += decoder.decode(chunk, { stream: true });
    }
    html += decoder.decode();
    const hasProductData = /application\/ld\+json/i.test(html) && /Freddo/i.test(html);
    checks.push({ retailerId: retailer.id, url: retailer.url, checkedAt, status: response.status, result: hasProductData ? 'structured-data-review-required' : 'browser-check-required' });
  } catch (error) {
    checks.push({ retailerId: retailer.id, url: retailer.url, checkedAt, result: 'fetch-failed', reason: error.name === 'TimeoutError' ? 'Timed out' : 'Could not fetch a bounded response' });
  }
}
await mkdir(new URL('../reports.local/', import.meta.url), { recursive: true });
const path = new URL(`../reports.local/source-check-${Date.now()}.json`, import.meta.url);
await writeFile(path, `${JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2)}\n`);
for (const check of checks) console.log(`${check.retailerId}: ${check.result}${check.status ? ` (HTTP ${check.status})` : ''}`);
console.log('Diagnostic saved under reports.local. Published observations were not changed.');
