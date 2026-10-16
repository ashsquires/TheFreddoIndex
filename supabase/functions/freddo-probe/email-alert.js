// Restricted one-off probe. Production incident delivery belongs to #7.
export const EMAIL_TEST = Object.freeze({
  userId: 'fb99ddb0-4537-46e3-a826-c26a71f13def',
  marker: 'freddo-intentionally-missing-20261016-watchdog',
  eventId: 'freddo-missing-run-email-20261016-v1',
  opensAt: Date.parse('2026-10-16T13:00:00Z'),
  closesAt: Date.parse('2026-10-17T12:00:00Z'),
});

export function createEmailAlertProbe({ storage, apiKey, enabled = false, fetchImpl = fetch, now = Date.now }) {
  return async identity => {
    if (!enabled || !apiKey || identity.userId !== EMAIL_TEST.userId) throw new Error('Email test disabled');
    const time = now();
    // The whole window is shorter than Resend's 24-hour idempotency retention.
    if (time < EMAIL_TEST.opensAt || time >= EMAIL_TEST.closesAt) throw new Error('Email test window closed');
    const receiptPath = `${identity.userId}/email-alerts/${EMAIL_TEST.eventId}.json`;
    const prior = await storage.read(receiptPath);
    if (prior) return { ...JSON.parse(new TextDecoder().decode(prior)), replayed: true };
    const completion = await storage.read(`${identity.userId}/${EMAIL_TEST.marker}.bin`);
    if (completion) return { status: 'completion_present', email_sent: false };
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': EMAIL_TEST.eventId },
      body: JSON.stringify({
        from: 'The Freddo Index <alert@thefreddoindex.com>',
        to: ['thefreddoindex@gmail.com'],
        subject: 'TEST: Freddo collection completion missing',
        text: 'This is an intentional unattended failure test for The Freddo Index, not a production collection failure.\n\nThe independent monitoring task checked the synthetic completion marker and found it missing.\n\nFor a real incident: inspect the collection run and retry after resolving the failure.\n\nTest reference: freddo-missing-run-email-20261016-v1\nNo production price data was changed.',
      }),
    });
    if (!response.ok) throw new Error('Email provider rejected request');
    const data = await response.json();
    if (typeof data.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(data.id)) throw new Error('Missing email receipt');
    const receipt = { event_id: EMAIL_TEST.eventId, email_id: data.id, status: 'accepted_by_provider', accepted_at: new Date(time).toISOString(), recipient: 'thefreddoindex@gmail.com' };
    await storage.create(receiptPath, new TextEncoder().encode(JSON.stringify(receipt)));
    const saved = await storage.read(receiptPath);
    if (!saved) throw new Error('Email receipt persistence failed');
    return JSON.parse(new TextDecoder().decode(saved));
  };
}
