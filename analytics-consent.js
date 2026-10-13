// Cloudflare is loaded only on the production hostname, unless the visitor opts out.
const storageKey = 'freddo-analytics-opt-out-v2';
const legacyKey = 'freddo-analytics-choice-v1';
let storageAvailable = true;
let optedOut = true;
let configured = false;
let returnFocus;

// Retire GA without deleting the GA property or its historical reports.
window['ga-disable-G-ZXG0LM7NCJ'] = true;
const domains = ['', ...location.hostname.split('.').map((_, i, parts) => parts.slice(i).join('.'))];
for (const cookie of document.cookie.split(';')) {
  const name = cookie.split('=')[0].trim();
  if (name !== '_ga' && !name.startsWith('_ga_')) continue;
  for (const domain of domains) {
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ''}`;
  }
}
try {
  const legacy = JSON.parse(localStorage.getItem(legacyKey) || 'null');
  if (localStorage.getItem(storageKey) === null && legacy?.value === 'rejected') {
    localStorage.setItem(storageKey, 'true');
  }
  localStorage.removeItem(legacyKey);
  // If preferences cannot be saved, leave analytics off rather than lose an objection.
  localStorage.setItem(`${storageKey}-check`, '1');
  localStorage.removeItem(`${storageKey}-check`);
  optedOut = localStorage.getItem(storageKey) === 'true';
} catch { storageAvailable = false; }
// Also honour this on reload if browser storage became unavailable during opt-out.
if (new URL(location.href).searchParams.get('analytics') === 'off') optedOut = true;

const panel = document.createElement('section');
panel.className = 'cookie-panel';
panel.hidden = true;
panel.setAttribute('aria-labelledby', 'analytics-title');
panel.innerHTML = `<div class="shell cookie-inner"><div><h2 id="analytics-title" tabindex="-1">Analytics settings</h2><p>We use cookieless Cloudflare analytics to count page views and understand site performance. <a href="./privacy.html#analytics">How it works</a></p><p data-analytics-status role="status"></p></div><div class="cookie-actions"><button type="button" data-analytics-toggle></button><button type="button" data-analytics-close>Close</button></div></div>`;
document.body.append(panel);
const status = panel.querySelector('[data-analytics-status]');
const toggle = panel.querySelector('[data-analytics-toggle]');
function updateStatus() {
  status.textContent = !storageAvailable ? 'Analytics is off because your browser cannot save your preference.'
    : !configured ? 'Analytics is currently unavailable on this page.'
    : optedOut ? 'Analytics is off in this browser.' : 'Analytics is on in this browser.';
  toggle.textContent = optedOut ? 'Turn analytics on' : 'Turn analytics off';
  toggle.disabled = !storageAvailable || !configured;
}
function closePanel() {
  panel.hidden = true;
  returnFocus?.focus();
}
panel.querySelector('[data-analytics-close]').addEventListener('click', closePanel);
panel.addEventListener('keydown', event => { if (event.key === 'Escape') closePanel(); });
document.querySelectorAll('[data-cookie-settings]').forEach(button => {
  button.hidden = false;
  button.addEventListener('click', () => {
    returnFocus = button;
    updateStatus();
    panel.hidden = false;
    panel.querySelector('h2').focus();
  });
});
toggle.addEventListener('click', () => {
  const next = !optedOut;
  try { localStorage.setItem(storageKey, String(next)); }
  catch {
    if (!next) { storageAvailable = false; updateStatus(); return; }
  }
  const url = new URL(location.href);
  if (next) url.searchParams.set('analytics', 'off');
  else url.searchParams.delete('analytics');
  // Reload to unload the beacon and its event listeners. Already sent/queued data cannot be recalled.
  location.replace(url.href);
});
window.addEventListener('storage', event => {
  if (event.key === storageKey || event.key === null) location.reload();
});

async function initialise() {
  try {
    const response = await fetch('./privacy-config.json', { cache: 'no-store' });
    if (!response.ok) return;
    const config = await response.json();
    configured = config.cloudflareAnalyticsEnabled === true
      && /^[a-f0-9]{32}$/.test(config.cloudflareToken || '')
      && location.hostname === 'thefreddoindex.com';
    updateStatus();
    if (!configured || optedOut || !storageAvailable) return;
    const script = document.createElement('script');
    script.type = 'module';
    script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    script.setAttribute('data-cf-beacon', JSON.stringify({ token: config.cloudflareToken }));
    document.head.append(script);
  } catch { /* A missing or invalid config leaves analytics off. */ }
}
initialise();
