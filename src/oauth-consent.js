import { createClient } from '@supabase/supabase-js';
if (window.top !== window.self) {
  document.body.textContent = 'Open this authorization page directly in your browser.';
  throw new Error('Framed consent is disabled');
}
const client = createClient('https://ectikpmaidqobqfsqife.supabase.co', 'sb_publishable_JlpWqctX_NXzcN9twF7F7w_19Mw0kWD', {
  auth: { flowType: 'pkce', storage: window.sessionStorage, storageKey: 'freddo-probe-consent' },
});
const status = document.querySelector('#status');
const login = document.querySelector('#login');
const consent = document.querySelector('#consent');
const requestedId = new URL(location.href).searchParams.get('authorization_id');
if (requestedId) sessionStorage.setItem('freddo-authorization-id', requestedId);
const authorizationId = requestedId || sessionStorage.getItem('freddo-authorization-id');
function showError(error) { status.textContent = error?.message || 'The connection could not be completed. Start again from ChatGPT.'; }
function redirect(url) {
  const destination = new URL(url);
  if (destination.protocol !== 'https:') throw new Error('Unsafe return address');
  location.assign(destination.href);
}
async function load() {
  if (!authorizationId) throw new Error('Start this connection from ChatGPT to obtain an authorization request.');
  const { data: { user } } = await client.auth.getUser();
  if (!user) { status.textContent = 'Sign in to approve this connection. Open the email link in this browser tab.'; login.hidden = false; return; }
  const { data, error } = await client.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error) throw error;
  if (!('authorization_id' in data)) { redirect(data.redirect_url); return; }
  status.textContent = `Signed in as ${user.email}`;
  document.querySelector('#details').textContent = `Application: ${data.client.name}\nClient: ${data.client.id ?? data.client.client_id}\nReturn address: ${data.redirect_uri}\nIdentity permissions: ${data.scope || '(none)'}\nFreddo access: test files only, subject to the server allowlist.`;
  consent.hidden = false;
}
login.addEventListener('submit', async event => {
  event.preventDefault();
  const button = login.querySelector('button');
  button.disabled = true;
  try {
    const email = new FormData(login).get('email');
    const callback = new URL('/oauth-consent.html', location.origin);
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: callback.href } });
    if (error) throw error;
    status.textContent = 'Check your email for the sign-in link. Open it in this same browser tab, then return to the connection request.';
  } catch (error) { showError(error); } finally { button.disabled = false; }
});
for (const decision of ['approve', 'deny']) document.querySelector(`#${decision}`).addEventListener('click', async () => {
  for (const button of consent.querySelectorAll('button')) button.disabled = true;
  try {
    const { data, error } = await client.auth.oauth[`${decision}Authorization`](authorizationId, { skipBrowserRedirect: true });
    if (error) throw error;
    redirect(data.redirect_url);
  } catch (error) { showError(error); for (const button of consent.querySelectorAll('button')) button.disabled = false; }
});
load().catch(showError);
