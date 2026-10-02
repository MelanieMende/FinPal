/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { ChatGptAuth } from './chatGptAuth';

jest.mock('electron', () => ({ shell: { openExternal: jest.fn() }, safeStorage: {
  isEncryptionAvailable: jest.fn(() => true),
  encryptString: jest.fn((value: string) => Buffer.from(`encrypted:${Buffer.from(value).toString('base64')}`)),
  decryptString: jest.fn((value: Buffer) => Buffer.from(value.toString().slice(10), 'base64').toString()),
} }));

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-auth-test-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function fixture(options: { nonce?: string; tamper?: boolean; scope?: string; expiresIn?: number } = {}) {
  const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'test', alg: 'RS256' };
  let authorize: URL;
  let badStateStatus: number;
  const openBrowser = jest.fn(async (url: string) => {
    authorize = new URL(url);
    const callback = new URL(authorize.searchParams.get('redirect_uri'));
    callback.search = new URLSearchParams({ code: 'fake-code', client_id: 'oaiapp_finpal_test', state: 'wrong-state' }).toString();
    badStateStatus = (await fetch(callback)).status;
    callback.searchParams.set('state', authorize.searchParams.get('state'));
    await fetch(callback);
  });
  const mockedFetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('openid-configuration')) return new Response(JSON.stringify({ issuer: 'https://auth.openai.com', jwks_uri: 'https://auth.openai.com/jwks', revocation_endpoint: 'https://auth.openai.com/revoke' }));
    if (url.endsWith('/jwks')) return new Response(JSON.stringify({ keys: [jwk] }));
    if (url.endsWith('/revoke')) return new Response('', { status: 200 });
    if (url.endsWith('/models')) return new Response(JSON.stringify({ models: [{ slug: 'account-model', display_name: 'Available model', visibility: 'list' }, { slug: 'hidden', visibility: 'hide' }] }));
    const form = new URLSearchParams(init.body as string);
    const isRefresh = form.get('grant_type') === 'refresh_token';
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test' })).toString('base64url');
    const claims = Buffer.from(JSON.stringify({ iss: 'https://auth.openai.com', aud: 'oaiapp_finpal_test', exp: Math.floor(Date.now() / 1000) + 3600, sub: 'account-subject', email: 'test@example.com', nonce: options.nonce || authorize.searchParams.get('nonce') })).toString('base64url');
    const signature = crypto.sign('sha256', Buffer.from(`${header}.${claims}`), pair.privateKey).toString('base64url');
    return new Response(JSON.stringify({ access_token: isRefresh ? 'refreshed-test-token' : 'initial-test-token', refresh_token: isRefresh ? 'rotated-test-refresh' : 'initial-test-refresh', token_type: 'Bearer', expires_in: isRefresh ? 3600 : options.expiresIn ?? 3600,
      scope: options.scope ?? 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
      id_token: `${header}.${claims}.${options.tamper ? 'bad-signature' : signature}`,
    }));
  });
  return { mockedFetch, openBrowser, auth: new ChatGptAuth(dir, mockedFetch as typeof fetch, openBrowser), getAuthorize: () => authorize, getBadStateStatus: () => badStateStatus };
}

it('uses PKCE, validates the callback and signature, persists host identity and loads only permitted models', async () => {
  const f = fixture();
  const status = await f.auth.signIn();
  expect(status.connected).toBe(true);
  expect(f.getBadStateStatus()).toBe(400);
  expect(f.getAuthorize().searchParams.get('client_id')).toBe('dynamic_agent_client');
  expect(f.getAuthorize().searchParams.get('agent_name_hint')).toBe('FinPal');
  expect(f.getAuthorize().searchParams.get('code_challenge_method')).toBe('S256');
  expect(f.getAuthorize().searchParams.get('ext_agent_host_id')).toMatch(/^urn:uuid:/);
  const tokenCall = f.mockedFetch.mock.calls.find(([url]) => url.endsWith('/token'));
  const form = new URLSearchParams(tokenCall[1].body as string);
  expect(form.get('client_id')).toBe('oaiapp_finpal_test');
  expect(form.get('redirect_uri')).toBe(f.getAuthorize().searchParams.get('redirect_uri'));
  expect(crypto.createHash('sha256').update(form.get('code_verifier')).digest('base64url')).toBe(f.getAuthorize().searchParams.get('code_challenge'));
  expect(await f.auth.models()).toEqual([{ slug: 'account-model', displayName: 'Available model' }]);
  expect(fs.readFileSync(path.join(dir, 'portfolio-chatgpt-session.bin'), 'utf8')).not.toContain('initial-test-token');
  const hostId = f.getAuthorize().searchParams.get('ext_agent_host_id');
  await f.auth.signOut();
  expect(f.auth.status().connected).toBe(false);
  await f.auth.signIn(status.activeClientId);
  expect(f.getAuthorize().searchParams.get('ext_agent_host_id')).toBe(hostId);
  expect(f.getAuthorize().searchParams.get('client_id')).toBe(status.activeClientId);
  expect(f.getAuthorize().searchParams.has('agent_name_hint')).toBe(false);
});

it.each([{ nonce: 'wrong-nonce' }, { tamper: true }, { scope: 'openid email' }])('rejects unverifiable identity or missing plan permission: %j', async options => {
  const f = fixture(options);
  await expect(f.auth.signIn()).rejects.toThrow();
  expect(f.auth.status().connected).toBe(false);
});

it('serializes refreshes and persists rotating tokens before reuse', async () => {
  const f = fixture({ expiresIn: 1 });
  await f.auth.signIn();
  expect(await Promise.all([f.auth.accessToken(), f.auth.accessToken()])).toEqual(['refreshed-test-token', 'refreshed-test-token']);
  const refreshes = f.mockedFetch.mock.calls.filter(([url, init]) => url.endsWith('/token') && new URLSearchParams(init.body as string).get('grant_type') === 'refresh_token');
  expect(refreshes).toHaveLength(1);
  expect(await f.auth.accessToken()).toBe('refreshed-test-token');
});
