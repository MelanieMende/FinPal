import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { safeStorage, shell } from 'electron';

const AUTH_ORIGIN = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const SCOPE = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';

interface Session {
  clientId: string; subject: string; email: string; accessToken?: string; refreshToken?: string; idToken?: string;
  expiresAt?: number; scopes?: string[];
}
interface AuthState { hostId: string; activeClientId?: string; sessions: Session[]; }
interface Discovery { issuer: string; jwks_uri: string; revocation_endpoint: string; }
interface Tokens { access_token: string; refresh_token?: string; id_token?: string; scope?: string; expires_in: number; token_type: string; }
export interface ChatGptStatus {
  connected: boolean; activeClientId?: string;
  accounts: Array<{ clientId: string; label: string; connected: boolean }>;
}
export interface ChatGptModel { slug: string; displayName: string; }

export class ChatGptAuth {
  private readonly file: string;
  private cancelPending?: () => void;
  private signingIn = false;
  private refreshPending?: Promise<string>;
  constructor(dataPath: string, private readonly requestFetch: typeof fetch = fetch, private readonly openBrowser = (url: string) => shell.openExternal(url)) {
    this.file = path.join(dataPath, 'portfolio-chatgpt-session.bin');
  }
  private read(): AuthState {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Sichere ChatGPT-Anmeldespeicherung ist nicht verfügbar.');
    if (!fs.existsSync(this.file)) return { hostId: `urn:uuid:${crypto.randomUUID()}`, sessions: [] };
    try { return JSON.parse(safeStorage.decryptString(fs.readFileSync(this.file))); }
    catch { throw new Error('Die gespeicherte ChatGPT-Anmeldung konnte nicht gelesen werden.'); }
  }
  private save(state: AuthState): void {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Sichere ChatGPT-Anmeldespeicherung ist nicht verfügbar.');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temp, safeStorage.encryptString(JSON.stringify(state)), { mode: 0o600 });
      fs.renameSync(temp, this.file);
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  }
  status(): ChatGptStatus {
    if (!safeStorage.isEncryptionAvailable()) return { connected: false, accounts: [] };
    const state = this.read();
    return {
      connected: !!state.sessions.find(s => s.clientId === state.activeClientId)?.refreshToken,
      activeClientId: state.activeClientId,
      accounts: state.sessions.map(s => ({ clientId: s.clientId, label: `${s.email || 'ChatGPT'} (${s.clientId.slice(-8)})`, connected: !!s.refreshToken })),
    };
  }
  cancelSignIn(): void { this.cancelPending?.(); }
  private async discovery(): Promise<Discovery> {
    const response = await this.requestFetch(`${AUTH_ORIGIN}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('ChatGPT-Anmeldedaten konnten nicht geladen werden.');
    const data: Discovery = await response.json();
    if (data.issuer !== AUTH_ORIGIN || ![data.jwks_uri, data.revocation_endpoint].every(url => {
      try { return new URL(url).origin === AUTH_ORIGIN; } catch { return false; }
    })) throw new Error('Ungültige ChatGPT-Anmeldekonfiguration.');
    return data;
  }
  private async token(form: Record<string, string>): Promise<Tokens> {
    const response = await this.requestFetch(`${AUTH_ORIGIN}/api/accounts/oauth/token`, {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...form, resource: RESOURCE }).toString(),
    });
    if (!response.ok) throw new Error('ChatGPT-Anmeldung konnte nicht erneuert werden. Bitte erneut anmelden.');
    const tokens: Tokens = await response.json();
    if (!tokens.access_token || tokens.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) {
      throw new Error('Ungültige ChatGPT-Anmeldeantwort.');
    }
    return tokens;
  }
  private async identity(token: string, clientId: string, nonce?: string): Promise<{ subject: string; email: string }> {
    const discovery = await this.discovery();
    const jwksResponse = await this.requestFetch(discovery.jwks_uri, { signal: AbortSignal.timeout(15000) });
    if (!jwksResponse.ok) throw new Error('ChatGPT-Signaturprüfung ist nicht erreichbar.');
    const jwks = await jwksResponse.json() as { keys: Array<crypto.webcrypto.JsonWebKey & { kid: string; alg?: string }> };
    try {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error();
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      if (!['RS256', 'ES256'].includes(header.alg)) throw new Error();
      const key = jwks.keys.find(k => k.kid === header.kid && (!k.alg || k.alg === header.alg));
      if (!key || (header.alg === 'RS256' ? key.kty !== 'RSA' : key.kty !== 'EC' || key.crv !== 'P-256')) throw new Error();
      const publicKey = crypto.createPublicKey({ key, format: 'jwk' });
      const valid = crypto.verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`),
        header.alg === 'ES256' ? { key: publicKey, dsaEncoding: 'ieee-p1363' } : publicKey, Buffer.from(parts[2], 'base64url'));
      const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (!valid || claims.iss !== discovery.issuer || !audience.includes(clientId)
        || (audience.length > 1 && claims.azp !== clientId) || (claims.azp && claims.azp !== clientId)
        || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()
        || (claims.nbf && claims.nbf * 1000 > Date.now() + 60000)
        || (nonce && claims.nonce !== nonce) || typeof claims.sub !== 'string' || !claims.sub) throw new Error();
      return { subject: claims.sub, email: typeof claims.email === 'string' ? claims.email : '' };
    } catch { throw new Error('Die ChatGPT-Anmeldung konnte nicht sicher bestätigt werden.'); }
  }

  async signIn(clientId?: string): Promise<ChatGptStatus> {
    if (this.signingIn || this.refreshPending) throw new Error('Eine ChatGPT-Anmeldung läuft bereits.');
    const state = this.read();
    const previous = clientId ? state.sessions.find(s => s.clientId === clientId) : undefined;
    if (clientId && !previous) throw new Error('Unbekanntes ChatGPT-Konto.');
    this.save(state); // Persist the host ID before the first browser authorization.
    this.signingIn = true;
    const oauthState = crypto.randomBytes(32).toString('base64url');
    const nonce = crypto.randomBytes(32).toString('base64url');
    const verifier = crypto.randomBytes(48).toString('base64url');
    const server = http.createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
    }).catch(error => { this.signingIn = false; throw error; });
    const address = server.address() as { port: number };
    const redirectUri = `http://127.0.0.1:${address.port}/auth/callback`;
    let timeout: ReturnType<typeof setTimeout>;
    let cancelled = false;
    try {
      const callback = new Promise<{ code: string; clientId: string }>((resolve, reject) => {
        this.cancelPending = () => { cancelled = true; reject(new Error('ChatGPT-Anmeldung abgebrochen.')); };
        timeout = setTimeout(() => reject(new Error('Die ChatGPT-Anmeldung ist abgelaufen. Bitte erneut versuchen.')), 180000);
        server.on('error', () => reject(new Error('Die lokale ChatGPT-Anmeldung ist fehlgeschlagen.')));
        server.on('request', (req, res) => {
          const url = new URL(req.url || '/', redirectUri);
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          if (req.method !== 'GET' || url.pathname !== '/auth/callback' || url.searchParams.get('state') !== oauthState) {
            res.writeHead(400); res.end('Ungültige Anmeldeanfrage.'); return;
          }
          if (url.searchParams.has('error')) { res.end('Anmeldung abgebrochen. Zurück zu FinPal.'); reject(new Error('Die ChatGPT-Berechtigung wurde nicht erteilt.')); return; }
          const issuedClientId = url.searchParams.get('client_id') || previous?.clientId;
          const code = url.searchParams.get('code');
          if (!code || !issuedClientId || issuedClientId === 'dynamic_agent_client' || (previous && issuedClientId !== previous.clientId)) {
            res.writeHead(400); res.end('Anmeldung konnte nicht bestätigt werden.'); reject(new Error('Ungültige ChatGPT-Registrierung.')); return;
          }
          res.end('Anmeldung erhalten. Bitte zu FinPal zurückkehren.');
          server.close();
          resolve({ code, clientId: issuedClientId });
        });
      });
      const url = new URL(`${AUTH_ORIGIN}/api/accounts/authorize`);
      url.search = new URLSearchParams({
        client_id: previous?.clientId || 'dynamic_agent_client', ext_agent_host_id: state.hostId,
        ...(!previous ? { agent_name_hint: 'FinPal' } : {}),
        ...(previous?.idToken ? { id_token_hint: previous.idToken } : {}),
        response_type: 'code', redirect_uri: redirectUri, scope: SCOPE, resource: RESOURCE,
        state: oauthState, nonce, code_challenge_method: 'S256', code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
      }).toString();
      // Attach a rejection handler before opening the browser, including launch failures.
      const opened = this.openBrowser(url.href).catch(() => { this.cancelPending?.(); });
      const received = await callback;
      await opened;
      const tokens = await this.token({ grant_type: 'authorization_code', client_id: received.clientId, code: received.code, code_verifier: verifier, redirect_uri: redirectUri });
      if (!tokens.id_token || !tokens.refresh_token) throw new Error('ChatGPT lieferte keine erneuerbare Anmeldung.');
      const identity = await this.identity(tokens.id_token, received.clientId, nonce);
      if (cancelled) throw new Error('ChatGPT-Anmeldung abgebrochen.');
      if (previous && previous.subject !== identity.subject) throw new Error('Das gewählte ChatGPT-Konto stimmt nicht mit der Anmeldung überein.');
      const scopes = tokens.scope?.split(/\s+/) ?? [];
      if (!scopes.includes('chatgpt.tokens.use.direct') || !scopes.includes('resource.invoke')) throw new Error('Die Nutzung deines ChatGPT-Kontingents wurde nicht erlaubt.');
      const session: Session = { ...identity, clientId: received.clientId, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, idToken: tokens.id_token, scopes, expiresAt: Date.now() + tokens.expires_in * 1000 };
      state.sessions = [...state.sessions.filter(s => s.clientId !== session.clientId), session];
      state.activeClientId = session.clientId;
      this.save(state);
      return this.status();
    } finally { clearTimeout(timeout!); server.close(); this.cancelPending = undefined; this.signingIn = false; }
  }

  async accessToken(): Promise<string> {
    if (this.refreshPending) return this.refreshPending;
    this.refreshPending = this.refreshAccess();
    try { return await this.refreshPending; } finally { this.refreshPending = undefined; }
  }
  private async refreshAccess(): Promise<string> {
    const state = this.read();
    const session = state.sessions.find(s => s.clientId === state.activeClientId);
    if (!session?.refreshToken) throw new Error('Bitte zuerst mit ChatGPT anmelden.');
    if (session.accessToken && session.expiresAt > Date.now() + 60000) return session.accessToken;
    const tokens = await this.token({ grant_type: 'refresh_token', client_id: session.clientId, refresh_token: session.refreshToken });
    const scopes = tokens.scope ? tokens.scope.split(/\s+/) : session.scopes;
    if (!scopes?.includes('chatgpt.tokens.use.direct') || !scopes.includes('resource.invoke')) throw new Error('ChatGPT-Kontingent ist nicht freigegeben. Bitte erneut anmelden.');
    if (tokens.id_token) {
      const identity = await this.identity(tokens.id_token, session.clientId);
      if (identity.subject !== session.subject) throw new Error('ChatGPT-Konto konnte nicht bestätigt werden.');
    }
    Object.assign(session, { accessToken: tokens.access_token, refreshToken: tokens.refresh_token || session.refreshToken, idToken: tokens.id_token || session.idToken, scopes, expiresAt: Date.now() + tokens.expires_in * 1000 });
    this.save(state);
    return session.accessToken;
  }
  async models(): Promise<ChatGptModel[]> {
    const response = await this.requestFetch(`${RESOURCE}/models`, { headers: { Authorization: `Bearer ${await this.accessToken()}` }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Die verfügbaren ChatGPT-Modelle konnten nicht geladen werden. Bitte erneut anmelden.');
    const data = await response.json() as { models: Array<{ slug: string; display_name: string; visibility: string }> };
    return (data.models || []).filter(m => m.visibility === 'list' && typeof m.slug === 'string').map(m => ({ slug: m.slug, displayName: m.display_name || m.slug }));
  }
  async signOut(): Promise<{ revoked: boolean }> {
    if (this.signingIn || this.refreshPending) throw new Error('Bitte die laufende ChatGPT-Anmeldung zuerst beenden.');
    const state = this.read();
    const session = state.sessions.find(s => s.clientId === state.activeClientId);
    let revoked = !session?.refreshToken;
    try {
      if (session?.refreshToken) {
        const discovery = await this.discovery();
        const response = await this.requestFetch(discovery.revocation_endpoint, {
          method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: session.refreshToken, token_type_hint: 'refresh_token', client_id: session.clientId }).toString(),
        });
        revoked = response.ok;
      }
    } catch { revoked = false; }
    if (session) { delete session.accessToken; delete session.refreshToken; delete session.idToken; delete session.expiresAt; }
    this.save(state);
    return { revoked };
  }
}
