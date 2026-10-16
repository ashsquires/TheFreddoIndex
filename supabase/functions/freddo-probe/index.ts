import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { createProbeReceiver, PROJECT_URL } from './handler.js';
import { createAuthenticator } from './auth.js';

if (Deno.env.get('SUPABASE_URL') !== PROJECT_URL) throw new Error('Wrong project: probe disabled');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const verifier = createClient(PROJECT_URL, Deno.env.get('SUPABASE_ANON_KEY')!, options);
const admin = createClient(PROJECT_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, options);
const bucket = admin.storage.from('freddo-auth-probes');
const authenticate = createAuthenticator({
  async verify(token: string) {
    const { data, error } = await verifier.auth.getClaims(token);
    return error ? null : data?.claims;
  },
  async authorize({ userId, clientId, sessionId }: { userId: string; clientId: string; sessionId: string }) {
    const { data, error } = await admin.rpc('freddo_probe_authorized', { p_user: userId, p_client: clientId, p_session: sessionId });
    if (error) throw new Error('Authorization check unavailable');
    return data === true;
  },
});
Deno.serve(createProbeReceiver({ authenticate, storage: {
  async create(path: string, bytes: Uint8Array) {
    const { error } = await bucket.upload(path, bytes, { contentType: 'application/octet-stream', upsert: false });
    if (error && !['409', '400'].includes(String(error.statusCode))) throw new Error('Upload failed');
  },
  async read(path: string) {
    const { data, error } = await bucket.download(path);
    if (error) throw new Error('Download failed');
    return new Uint8Array(await data.arrayBuffer());
  },
} }));
