import { PROJECT_URL, RESOURCE } from './handler.js';

// verify must validate the signature with Supabase, never merely decode a JWT.
export function createAuthenticator({ verify, authorize }) {
  return async token => {
    const claims = await verify(token);
    if (!claims || claims.iss !== `${PROJECT_URL}/auth/v1` || claims.aud !== RESOURCE || claims.role !== 'authenticated' ||
      typeof claims.exp !== 'number' || claims.exp <= Date.now() / 1000 ||
      !['sub', 'client_id', 'session_id'].every(key => typeof claims[key] === 'string' && claims[key].length > 0)) return null;
    const allowed = await authorize({ userId: claims.sub, clientId: claims.client_id, sessionId: claims.session_id });
    return allowed === true ? { userId: claims.sub } : null;
  };
}
