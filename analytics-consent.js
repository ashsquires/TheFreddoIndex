// The public switch lives in privacy-config.json. Disabled means NO analytics.
const measurementId = 'G-ZXG0LM7NCJ';
const storageKey = 'freddo-analytics-choice-v1';
const lifetime = 180 * 24 * 60 * 60 * 1000;
let enabled = false;
let started = false;
let returnFocus;
window[`ga-disable-${measurementId}`] = true;

function savedChoice() {
  try {
    const choice = JSON.parse(localStorage.getItem(storageKey));
    return choice && ['accepted', 'rejected'].includes(choice.value)
      && Number.isFinite(choice.at) && choice.at <= Date.now()
      && Date.now() - choice.at < lifetime ? choice.value : null;
  } catch { return null; }
}

function clearAnalyticsCookies() {
  const hostParts = location.hostname.split('.');
  const domains = ['', ...hostParts.map((_, i) => hostParts.slice(i).join('.'))];
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0].trim();
    if (name !== '_ga' && !name.startsWith('_ga_')) continue;
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ''}`;
    }
  }
}

function startAnalytics() {
  if (!enabled || started) return;
  started = true;
  window[`ga-disable-${measurementId}`] = false;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', {
    analytics_storage: 'granted', ad_storage: 'denied',
    ad_user_data: 'denied', ad_personalization: 'denied',
  });
  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    allow_google_signals: false, allow_ad_personalization_signals: false,
    cookie_expires: lifetime / 1000, cookie_update: false,
  });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.append(script);
}

const panel = document.createElement('section');
panel.className = 'cookie-panel';
panel.hidden = true;
panel.setAttribute('aria-labelledby', 'cookie-title');
panel.innerHTML = `<div class="shell cookie-inner"><div><p class="eyebrow">Your choice</p><h2 id="cookie-title" tabindex="-1">A little less mystery. Even with cookies.</h2><p>May we use Google Analytics to understand visits and improve the index? It uses optional cookies. Rejecting won’t change how the site works. <a href="./privacy.html">Privacy &amp; Cookies</a></p></div><div class="cookie-actions"><button type="button" data-choice="accepted">Accept analytics</button><button type="button" data-choice="rejected">Reject analytics</button></div></div>`;
document.body.append(panel);
const status = document.createElement('p');
status.className = 'privacy-sr-only';
status.setAttribute('role', 'status');
document.body.append(status);

function updateStatus(choice) {
  document.querySelectorAll('[data-privacy-headline]').forEach(node => {
    node.textContent = enabled ? 'Freddo prices. Your privacy. Your choice.' : 'We track Freddo prices, not you.';
  });
  document.querySelectorAll('[data-analytics-status]').forEach(node => {
    node.textContent = !enabled ? 'Google Analytics is currently switched off. No analytics cookies are set and no analytics data is sent to Google.'
      : choice === 'accepted' ? 'You have accepted analytics. You can change your choice below at any time.'
      : choice === 'rejected' ? 'You have rejected analytics. Google Analytics is not running.'
      : 'Analytics is optional and stays off unless you accept it.';
  });
}

panel.addEventListener('click', event => {
  const button = event.target.closest('[data-choice]');
  if (!button || !enabled) return;
  const choice = button.dataset.choice;
  try { localStorage.setItem(storageKey, JSON.stringify({ value: choice, at: Date.now() })); } catch { /* This page still honours the choice when storage is unavailable. */ }
  if (choice === 'accepted') startAnalytics();
  else {
    window[`ga-disable-${measurementId}`] = true;
    clearAnalyticsCookies();
    // Unload Google's code so automatic events cannot continue after withdrawal.
    if (started) { location.reload(); return; }
  }
  panel.hidden = true;
  updateStatus(choice);
  status.textContent = choice === 'accepted' ? 'Analytics accepted.' : 'Analytics rejected.';
  (returnFocus || document.querySelector('[data-cookie-settings]'))?.focus();
});

document.querySelectorAll('[data-cookie-settings]').forEach(button => {
  button.addEventListener('click', () => {
    if (!enabled) return;
    returnFocus = button;
    panel.hidden = false;
    panel.querySelector('h2').focus();
  });
});

// Apply a changed choice to other open tabs too.
window.addEventListener('storage', event => {
  if (event.key === storageKey || event.key === null) location.reload();
});

async function initialise() {
  try {
    const response = await fetch('./privacy-config.json', { cache: 'no-store' });
    if (response.ok) enabled = (await response.json()).analyticsControlsEnabled === true;
  } catch { /* Fail closed: a missing or invalid configuration never enables GA. */ }
  const choice = savedChoice();
  document.querySelectorAll('[data-cookie-settings]').forEach(button => { button.hidden = !enabled; });
  updateStatus(choice);
  if (!enabled) {
    clearAnalyticsCookies();
    // Enabling again requires a fresh choice, even if previously accepted.
    try { localStorage.removeItem(storageKey); } catch { /* Storage may be unavailable. */ }
  } else if (choice === 'accepted') startAnalytics();
  else {
    clearAnalyticsCookies();
    panel.hidden = choice === 'rejected';
  }
}
initialise();
