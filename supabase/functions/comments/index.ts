import { handleComments } from './handler.js';

const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const salt = Deno.env.get('COMMENT_RATE_LIMIT_SECRET');
const allowedOrigins = (Deno.env.get('COMMENT_ALLOWED_ORIGINS') ?? 'https://thefreddoindex.com').split(',').map(value => value.trim()).filter(Boolean);

Deno.serve(async (request: Request) => {
  if (!url || !key || !salt || salt.length < 32) return new Response(JSON.stringify({ error: 'Comments are not configured yet.' }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  return handleComments(request, {
    allowedOrigins,
    async rpc(name: string, body: unknown) {
      const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
      });
      const text = await response.text();
      const result = text ? JSON.parse(text) : null;
      return response.ok ? { data: result, error: null } : { data: null, error: result ?? { code: 'unknown' } };
    },
    async fingerprint(req: Request) {
      // Fingerprinting is one layer only: the database also imposes global
      // and moderation-queue limits, even if a caller changes proxy headers.
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const value = `${new Date().toISOString().slice(0, 10)}:${ip}`;
      const hash = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(value));
      return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    },
  });
});
