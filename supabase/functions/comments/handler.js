const MAX_BYTES = 8192;

async function readBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_BYTES) throw new Error('too-large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid-json');
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); throw new Error('too-large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function validateComment(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (typeof input.name !== 'string' || typeof input.body !== 'string') return null;
  const name = input.name.trim();
  const body = input.body.trim();
  if ([...name].length < 2 || [...name].length > 40 || [...body].length < 3 || [...body].length > 1000) return null;
  if (/[\u0000-\u001f\u007f]/.test(name) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) return null;
  return { name, body };
}

export async function handleComments(request, { rpc, fingerprint, allowedOrigins }) {
  const origin = request.headers.get('origin');
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex',
  };
  if (origin && !allowedOrigins.includes(origin)) return new Response(JSON.stringify({ error: 'Origin not allowed.' }), { status: 403, headers });
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  const respond = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' } });
  if (!['GET', 'POST'].includes(request.method)) return respond({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST, OPTIONS' });
  try {
    if (request.method === 'GET') {
      const result = await rpc('freddo_list_comments', {});
      if (result.error) return respond({ error: 'Comments are temporarily unavailable.' }, 503);
      // Explicitly allow only public fields, even if the database result changes.
      return respond({ comments: (result.data ?? []).map(({ id, display_name, body, created_at }) => ({ id, name: display_name, body, createdAt: created_at })) });
    }
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return respond({ error: 'Send a JSON comment.' }, 415);
    let input;
    try { input = await readBody(request); }
    catch (error) { return respond({ error: error.message === 'too-large' ? 'Your comment is too large.' : 'Invalid comment.' }, error.message === 'too-large' ? 413 : 400); }
    // Honeypot: behave like a successful submission without storing bot content.
    if (input?.website) return respond({ message: 'Thanks! Your comment is awaiting approval.' }, 202);
    const comment = validateComment(input);
    if (!comment) return respond({ error: 'Use a nickname of 2–40 characters and a comment of 3–1,000 characters.' }, 400);
    const result = await rpc('freddo_submit_comment', {
      p_display_name: comment.name, p_body: comment.body,
      p_fingerprint: await fingerprint(request),
    });
    if (result.error?.code === 'P0001') return respond({ error: 'Too many comments right now. Please try again in ten minutes.' }, 429, { 'Retry-After': '600' });
    if (result.error) return respond({ error: 'We couldn’t save your comment. Please try again later.' }, 503);
    return respond({ message: 'Thanks! Your comment is awaiting approval.' }, 202);
  } catch {
    // Never send database errors, environment values or network identifiers to clients.
    return respond({ error: 'Comments are temporarily unavailable. Please try again later.' }, 503);
  }
}
