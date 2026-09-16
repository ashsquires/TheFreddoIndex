export const CONTACT_ADDRESS = 'thefreddoindex@gmail.com';

export function contactMailto(name, message) {
  const sender = String(name ?? '').trim();
  const body = String(message ?? '').trim();
  if (!body || body.length > 1000 || sender.length > 80) throw new RangeError('Invalid contact message');
  const subject = sender ? `Freddo Index message from ${sender}` : 'Freddo Index message';
  const content = sender ? `${body}\n\nFrom: ${sender}` : body;
  return `mailto:${CONTACT_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(content)}`;
}
