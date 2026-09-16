import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTACT_ADDRESS, contactMailto } from '../contact-mailto.js';

test('contact draft addresses the requested mailbox and safely encodes text', () => {
  assert.equal(CONTACT_ADDRESS, 'thefreddoindex@gmail.com');
  const draft = contactMailto(' Barbara & co ', 'A Freddo costs 45p?\nThat is wild.');
  assert.ok(draft.startsWith(`mailto:${CONTACT_ADDRESS}?`));
  const params = new URL(draft).searchParams;
  assert.equal(params.get('subject'), 'Freddo Index message from Barbara & co');
  assert.equal(params.get('body'), 'A Freddo costs 45p?\nThat is wild.\n\nFrom: Barbara & co');
  assert.throws(() => contactMailto('', '   '), RangeError);
  assert.throws(() => contactMailto('', 'x'.repeat(1001)), RangeError);
});
