import { contactMailto } from './contact-mailto.js';

const form = document.getElementById('contact-form');
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const name = form.elements.namedItem('name').value;
  const message = form.elements.namedItem('message').value;
  try {
    const draft = contactMailto(name, message);
    document.getElementById('contact-status').textContent = 'Your email app should open with a draft. Press Send there to deliver your message.';
    window.location.href = draft;
  } catch {
    document.getElementById('contact-status').textContent = 'Please enter a message of up to 1,000 characters.';
  }
});
