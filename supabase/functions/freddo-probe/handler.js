export const PROJECT_URL = 'https://ectikpmaidqobqfsqife.supabase.co';
export const RESOURCE = `${PROJECT_URL}/functions/v1/freddo-probe`;
const metadataUrl = `${RESOURCE}/.well-known/oauth-protected-resource`;
const idSchema = { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,80}$' };
const tools = ['put', 'get'].map(operation => ({
  name: `probe_${operation}`,
  description: operation === 'put' ? 'Store a small synthetic test file in the isolated Freddo probe area. Never use for production prices.' : 'Read back the bytes of your synthetic Freddo test file.',
  inputSchema: { type: 'object', properties: { probe_id: idSchema, ...(operation === 'put' ? { base64: { type: 'string', maxLength: 87384 } } : {}) }, required: operation === 'put' ? ['probe_id', 'base64'] : ['probe_id'], additionalProperties: false },
  annotations: { readOnlyHint: operation === 'get', destructiveHint: false, idempotentHint: true, openWorldHint: false },
  securitySchemes: [{ type: 'oauth2', scopes: ['email'] }],
}));
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
});

/**
 * @param {{
 *   authenticate: (token: string) => Promise<{userId: string} | null>,
 *   storage: {create: (path: string, bytes: Uint8Array) => Promise<void>, read: (path: string) => Promise<Uint8Array | null>},
 *   emailAlert?: (identity: {userId: string}) => Promise<unknown>
 * }} options
 */
export function createProbeReceiver({ authenticate, storage, emailAlert }) {
  return async request => {
    const path = new URL(request.url).pathname.replace(/^\/functions\/v1/, '');
    if (request.method === 'GET' && path === '/freddo-probe/.well-known/oauth-protected-resource') return json({
      resource: RESOURCE, authorization_servers: [`${PROJECT_URL}/auth/v1`], scopes_supported: ['email'], bearer_methods_supported: ['header'],
    });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
    if (request.headers.has('origin')) return json({ error: 'Browser origins not supported' }, 403);
    if (path !== '/freddo-probe') return json({ error: 'Not found' }, 404);
    const token = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    let identity;
    try { identity = token ? await authenticate(token) : null; }
    catch { return json({ error: 'Authentication unavailable' }, 503); }
    if (!identity) return json({ error: 'Authentication required' }, 401, {
      'WWW-Authenticate': `Bearer resource_metadata="${metadataUrl}"`,
    });
    let message;
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON required' }, 415);
    try {
      const reader = request.body?.getReader();
      let length = 0;
      let body = '';
      const decoder = new TextDecoder();
      if (reader) while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 100000) { await reader.cancel(); return json({ error: 'Request too large' }, 413); }
        body += decoder.decode(value, { stream: true });
      }
      message = JSON.parse(body + decoder.decode());
    } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string' || Array.isArray(message)) return json({ error: 'Invalid request' }, 400);
    if (message.method === 'notifications/initialized' && message.id === undefined) return new Response(null, { status: 202 });
    const result = value => json({ jsonrpc: '2.0', id: message.id ?? null, result: value });
    if (message.method === 'initialize') return result({ protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'freddo-probe', version: '0.1.0' } });
    if (message.method === 'ping') return result({});
    if (message.method === 'tools/list') return result({ tools: [...tools, ...(emailAlert ? [{
      name: 'probe_check_email_alert',
      description: 'Check the fixed synthetic completion marker and send one deduplicated test failure email to the Freddo owner if it is missing. No arbitrary recipients or content. Temporary test only.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      securitySchemes: [{ type: 'oauth2', scopes: ['email'] }],
    }] : [])] });
    if (message.method === 'tools/call') {
      const fail = text => result({ isError: true, content: [{ type: 'text', text }] });
      const { name, arguments: args } = message.params ?? {};
      if (name === 'probe_check_email_alert' && emailAlert) {
        if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length) return fail('Email test accepts no fields');
        try {
          const data = await emailAlert(identity);
          return result({ structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }] });
        } catch { return fail('Email test failed; no delivery confirmation'); }
      }
      if (!['probe_put', 'probe_get'].includes(name)) return fail('Unknown tool');
      if (!args || typeof args !== 'object' || !/^[a-zA-Z0-9_-]{1,80}$/.test(args.probe_id ?? '') || typeof args.probe_id !== 'string') return fail('Invalid probe ID');
      if (Object.keys(args).some(key => !['probe_id', ...(name === 'probe_put' ? ['base64'] : [])].includes(key))) return fail('Unexpected field');
      const path = `${identity.userId}/${args.probe_id}.bin`;
      try {
        let bytes;
        if (name === 'probe_put') {
          if (typeof args.base64 !== 'string' || args.base64.length > 87384 || !args.base64.length) return fail('File must contain 1–65536 bytes');
          const decoded = atob(args.base64);
          if (btoa(decoded) !== args.base64 || decoded.length > 65536) return fail('Invalid base64 or oversized file');
          bytes = Uint8Array.from(decoded, character => character.charCodeAt(0));
          await storage.create(path, bytes);
          // Read after create also resolves concurrent replays without overwrites.
          const stored = await storage.read(path);
          if (!stored) return fail('Storage verification failed');
          if (stored.length !== bytes.length || stored.some((byte, index) => byte !== bytes[index])) return fail('Conflict: probe ID already has different bytes');
          bytes = stored;
        } else {
          bytes = await storage.read(path);
          if (!bytes) return fail('Probe not found');
        }
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const data = { probe_id: args.probe_id, byte_size: bytes.length, sha256: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''), ...(name === 'probe_get' ? { base64: btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')) } : {}) };
        return result({ structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }] });
      } catch { return fail('Probe operation failed'); }
    }
    return json({ jsonrpc: '2.0', id: message.id ?? null, error: { code: -32601, message: 'Method not found' } });
  };
}
