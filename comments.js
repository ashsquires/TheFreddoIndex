const section = document.getElementById('comments');
const form = document.getElementById('comment-form');
const list = document.getElementById('comments-list');
const listStatus = document.getElementById('comments-status');
const formStatus = document.getElementById('comment-form-status');
const retry = document.getElementById('comments-retry');
let endpoint;

document.getElementById('have-your-say').addEventListener('click', () => {
  const status = document.getElementById('reaction-status');
  if (!endpoint || section.hidden) {
    status.textContent = 'Comments are coming soon.';
    return;
  }
  status.textContent = '';
  section.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  document.getElementById('comment-name').focus({ preventScroll: true });
});

async function loadComments() {
  retry.hidden = true;
  listStatus.textContent = 'Loading comments…';
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(12_000), cache: 'no-store' });
    if (!response.ok) throw new Error('unavailable');
    const data = await response.json();
    if (!Array.isArray(data.comments)) throw new Error('invalid response');
    const articles = data.comments.slice(0, 50).map(comment => {
      const article = document.createElement('article');
      article.className = 'reader-comment';
      const heading = document.createElement('h3');
      heading.textContent = comment.name;
      const time = document.createElement('time');
      const date = new Date(comment.createdAt);
      if (Number.isFinite(date.getTime())) {
        time.dateTime = date.toISOString();
        time.textContent = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      }
      const body = document.createElement('p');
      // User text is never interpreted as HTML or converted into clickable links.
      body.textContent = comment.body;
      article.append(heading, time, body);
      return article;
    });
    list.replaceChildren(...articles);
    listStatus.textContent = articles.length ? `${articles.length} approved ${articles.length === 1 ? 'comment' : 'comments'}` : 'No comments yet. Be the first to remember the 10p days.';
  } catch {
    listStatus.textContent = 'Comments couldn’t load. Please try again.';
    retry.hidden = false;
  }
}

retry.addEventListener('click', loadComments);
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!endpoint || !form.reportValidity()) return;
  const button = form.querySelector('button[type="submit"]');
  if (button.disabled) return;
  button.disabled = true;
  formStatus.textContent = 'Sending your comment…';
  const data = new FormData(form);
  try {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: data.get('name'), body: data.get('body'), website: data.get('website') }),
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status === 429) {
      formStatus.textContent = 'Too many comments right now. Please try again in ten minutes.';
    } else if (response.status === 400) {
      formStatus.textContent = 'Use a nickname of 2–40 characters and a comment of 3–1,000 characters.';
    } else if (response.status === 202) {
      form.reset();
      formStatus.textContent = 'Thanks! Your comment is awaiting approval.';
    } else {
      formStatus.textContent = 'We couldn’t save your comment. Your draft is still here; please try again later.';
    }
  } catch {
    formStatus.textContent = 'We couldn’t confirm whether your comment was saved. Your draft is still here. Please wait before trying again.';
  } finally {
    button.disabled = false;
  }
});

async function initComments() {
  try {
    // Runtime config keeps the root-hosted and built versions identical.
    const response = await fetch('/comments-config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('No comments configuration');
    const config = await response.json();
    if (typeof config.endpoint === 'string' && config.endpoint.trim()) {
      const configured = new URL(config.endpoint, window.location.origin);
      const local = ['localhost', '127.0.0.1'].includes(configured.hostname);
      if (configured.protocol !== 'https:' && !(local && configured.protocol === 'http:')) throw new Error('Insecure comments endpoint');
      endpoint = configured.href;
      section.hidden = false;
      await loadComments();
    }
  } catch {
    // Don't advertise an unusable form before the owner connects a real backend.
    section.hidden = true;
  }
}

initComments();
