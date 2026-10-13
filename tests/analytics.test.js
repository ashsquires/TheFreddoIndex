import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../analytics-consent.js', import.meta.url), 'utf8');
const config = JSON.parse(await readFile(new URL('../privacy-config.json', import.meta.url), 'utf8'));
async function page({ saved = {}, hostname = 'thefreddoindex.com', settings = config, blocked = false, search = '' } = {}) {
  const events = {}, scripts = [], data = new Map(Object.entries(saved));
  function element() {
    return { hidden: false, attrs: {}, listeners: {}, children: new Map(),
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(k, v) { this.listeners[k] = v; },
      focus() {}, querySelector(k) { if (!this.children.has(k)) this.children.set(k, element()); return this.children.get(k); },
    };
  }
  const button = element(); let panel; const deletedCookies = [];
  const location = { hostname, href: `https://${hostname}/${search}`, replace(url) { this.destination = url; }, reload() { this.reloaded = true; } };
  const context = { URL, location, window: { addEventListener(k, v) { events[k] = v; } },
    document: { get cookie() { return '_ga=old; _ga_TEST=old; unrelated=keep'; }, set cookie(v) { deletedCookies.push(v); },
      createElement: element, querySelectorAll: () => [button], body: { append(el) { panel = el; } }, head: { append(el) { scripts.push(el); } } },
    localStorage: { getItem(k) { if (blocked) throw Error('blocked'); return data.get(k) ?? null; }, setItem(k, v) { if (blocked) throw Error('blocked'); data.set(k, v); }, removeItem(k) { if (blocked) throw Error('blocked'); data.delete(k); } },
    fetch: async () => ({ ok: !!settings, json: async () => settings }),
  };
  vm.runInNewContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return { scripts, panel, button, data, location, events, deletedCookies };
}
test('production loads Cloudflare once without opening a banner or loading GA', async () => {
  const p = await page(); assert.equal(p.scripts.length, 1);
  assert.equal(p.scripts[0].src, 'https://static.cloudflareinsights.com/beacon.min.js');
  assert.equal(JSON.parse(p.scripts[0].attrs['data-cf-beacon']).token, config.cloudflareToken);
  assert.equal(p.panel.hidden, true); assert.equal(p.button.hidden, false);
  assert.ok(p.deletedCookies.some(v => v.startsWith('_ga=')));
  assert.ok(p.deletedCookies.every(v => !v.startsWith('unrelated=')));
});
test('saved opt-out and legacy GA rejection suppress the beacon', async () => {
  for (const saved of [{ 'freddo-analytics-opt-out-v2': 'true' }, { 'freddo-analytics-choice-v1': JSON.stringify({value:'rejected',at:0}) }]) {
    const p = await page({ saved }); assert.equal(p.scripts.length, 0); assert.equal(p.data.get('freddo-analytics-opt-out-v2'), 'true');
  }
});
test('disabled, missing, invalid config, preview, URL opt-out and blocked storage send nothing', async () => {
  for (const options of [{settings:null},{settings:{...config,cloudflareAnalyticsEnabled:false}},{settings:{...config,cloudflareToken:'bad'}},{hostname:'localhost'},{blocked:true},{search:'?analytics=off'}]) {
    assert.equal((await page(options)).scripts.length, 0);
  }
});
test('settings open on demand; opting out persists and reloads with a fallback', async () => {
  const p = await page(); p.button.listeners.click(); assert.equal(p.panel.hidden, false);
  p.panel.querySelector('[data-analytics-toggle]').listeners.click();
  assert.equal(p.data.get('freddo-analytics-opt-out-v2'), 'true');
  assert.equal(new URL(p.location.destination).searchParams.get('analytics'), 'off');
});
test('opting back in clears URL suppression and saves the preference', async () => {
  const p = await page({ saved:{'freddo-analytics-opt-out-v2':'true'}, search:'?analytics=off' });
  p.panel.querySelector('[data-analytics-toggle]').listeners.click();
  assert.equal(p.data.get('freddo-analytics-opt-out-v2'), 'false');
  assert.equal(new URL(p.location.destination).searchParams.has('analytics'), false);
});
test('preference changes in another tab trigger reload', async () => {
  const p = await page(); p.events.storage({key:'unrelated'}); assert.equal(p.location.reloaded, undefined);
  p.events.storage({key:'freddo-analytics-opt-out-v2'}); assert.equal(p.location.reloaded, true);
});
