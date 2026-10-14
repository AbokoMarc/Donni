import {createAuthApi} from '../src/api/auth';
import {ApiClient} from '../src/api/client';
import type {FetchLike, TokenStore} from '../src/api/client';
import {ApiError, AuthExpiredError, NetworkError, messageFor} from '../src/api/errors';
import type {TokenPair} from '../src/api/types';
import {createRepository} from '../src/db/repository';
import {AccountMismatchError, SessionService} from '../src/auth/SessionService';
import {SyncStorage} from '../src/sync/SyncStorage';
import {createTestStore} from './support/nodeSqlite';

function memoryTokens(initial: TokenPair | null): TokenStore & {value: TokenPair | null} {
  const store = {
    value: initial,
    async load() {
      return store.value;
    },
    async save(t: TokenPair) {
      store.value = t;
    },
    async clear() {
      store.value = null;
    },
  };
  return store;
}

interface Call {
  url: string;
  method: string;
  auth: string | undefined;
  body: unknown;
}

function scriptedFetch(handler: (call: Call) => {status: number; body?: unknown} | Promise<{status: number; body?: unknown}>) {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const call = {url, method: init.method, auth: init.headers.Authorization, body: init.body ? JSON.parse(init.body) : undefined};
    calls.push(call);
    const out = await handler(call);
    return {status: out.status, text: async () => (out.body === undefined ? '' : JSON.stringify(out.body))};
  };
  return {fetchImpl, calls};
}

const pair = (n: number): TokenPair => ({accessToken: `a${n}`, refreshToken: `r${n}`});

describe('client HTTP', () => {
  it('ajoute le jeton et lit le JSON', async () => {
    const {fetchImpl, calls} = scriptedFetch(() => ({status: 200, body: {ok: 1}}));
    const client = new ApiClient({baseUrl: () => 'http://h/api/v1/', tokens: memoryTokens(pair(1)), fetchImpl});
    expect(await client.request('GET', '/auth/me')).toEqual({ok: 1});
    expect(calls[0].url).toBe('http://h/api/v1/auth/me');
    expect(calls[0].auth).toBe('Bearer a1');
  });

  it('transforme les erreurs en erreurs typées', async () => {
    const {fetchImpl} = scriptedFetch(() => ({
      status: 422,
      body: {status: 422, code: 'validation_failed', message: 'Données invalides', fields: {phone: 'Numéro invalide'}},
    }));
    const client = new ApiClient({baseUrl: () => 'http://h', tokens: memoryTokens(pair(1)), fetchImpl});
    try {
      await client.request('POST', '/x', {body: {}});
      expect('pas atteint').toBe('atteint');
    } catch (error) {
      expect(error instanceof ApiError).toBe(true);
      expect((error as ApiError).code).toBe('validation_failed');
      expect(messageFor(error)).toBe('Numéro invalide');
    }
  });

  it('signale une panne réseau', async () => {
    const client = new ApiClient({
      baseUrl: () => 'http://h',
      tokens: memoryTokens(pair(1)),
      fetchImpl: async () => {
        throw new TypeError('Network request failed');
      },
    });
    await expect(client.request('GET', '/x')).rejects.toThrow(NetworkError);
  });

  it('expire au bout du délai', async () => {
    const client = new ApiClient({
      baseUrl: () => 'http://h',
      tokens: memoryTokens(pair(1)),
      timeoutMs: 20,
      fetchImpl: () => new Promise(() => undefined),
    });
    await expect(client.request('GET', '/x')).rejects.toThrow(NetworkError);
  });

  it('rafraîchit une seule fois pour des requêtes simultanées', async () => {
    let refreshes = 0;
    const {fetchImpl, calls} = scriptedFetch(async call => {
      if (call.url.endsWith('/auth/refresh')) {
        refreshes += 1;
        await new Promise(r => setTimeout(r, 10));
        return {status: 200, body: {accessToken: 'a2', refreshToken: 'r2', expiresIn: 900, user: {}}};
      }
      return call.auth === 'Bearer a2' ? {status: 200, body: {ok: true}} : {status: 401, body: {code: 'token_expired'}};
    });
    const tokens = memoryTokens(pair(1));
    const client = new ApiClient({baseUrl: () => 'http://h', tokens, fetchImpl});
    const results = await Promise.all([client.request('GET', '/a'), client.request('GET', '/b'), client.request('GET', '/c')]);
    expect(results).toEqual([{ok: true}, {ok: true}, {ok: true}]);
    expect(refreshes).toBe(1);
    expect(tokens.value).toEqual(pair(2));
    expect(calls.filter(c => c.auth === 'Bearer a1')).toHaveLength(3);
  });

  it('vide la session quand le refresh est refusé', async () => {
    const {fetchImpl} = scriptedFetch(call =>
      call.url.endsWith('/auth/refresh') ? {status: 401, body: {code: 'refresh_reused'}} : {status: 401},
    );
    const tokens = memoryTokens(pair(1));
    let expired = 0;
    const client = new ApiClient({baseUrl: () => 'http://h', tokens, fetchImpl, onSessionExpired: () => (expired += 1)});
    await expect(client.request('GET', '/a')).rejects.toThrow(AuthExpiredError);
    expect(tokens.value).toBeNull();
    expect(expired).toBe(1);
    await expect(client.request('GET', '/a')).rejects.toThrow(AuthExpiredError);
  });

  it('conserve la session quand le refresh échoue faute de réseau ou de serveur', async () => {
    const {fetchImpl} = scriptedFetch(call => (call.url.endsWith('/auth/refresh') ? {status: 503} : {status: 401}));
    const tokens = memoryTokens(pair(1));
    const client = new ApiClient({baseUrl: () => 'http://h', tokens, fetchImpl});
    await expect(client.request('GET', '/a')).rejects.toThrow(ApiError);
    expect(tokens.value).toEqual(pair(1));
  });

  it('gère les réponses 204 et les routes publiques', async () => {
    const {fetchImpl, calls} = scriptedFetch(() => ({status: 204}));
    const client = new ApiClient({baseUrl: () => 'http://h', tokens: memoryTokens(null), fetchImpl});
    expect(await client.request('POST', '/auth/password/forgot', {body: {phone: '+237'}, auth: false})).toBeUndefined();
    expect(calls[0].auth).toBeUndefined();
    await expect(client.request('GET', '/auth/me')).rejects.toThrow(AuthExpiredError);
  });
});

async function sessionSetup() {
  const ctx = await createTestStore();
  const repo = createRepository(ctx.store);
  const storage = new SyncStorage(ctx.store, () => ctx.clock.now);
  const tokens = memoryTokens(null);
  let nextUser = {id: 'u1', fullName: 'Marc', phone: '+237690000001'};
  let revoked = 0;
  const {fetchImpl, calls} = scriptedFetch(call => {
    if (call.url.endsWith('/auth/register') || call.url.endsWith('/auth/login')) {
      return {status: 200, body: {accessToken: 'a1', refreshToken: 'r1', expiresIn: 900, user: nextUser}};
    }
    if (call.url.endsWith('/auth/logout')) {
      revoked += 1;
    }
    return {status: 204};
  });
  const client = new ApiClient({baseUrl: () => 'http://h', tokens, fetchImpl});
  const sync: string[] = [];
  const session = new SessionService({
    auth: createAuthApi(client),
    store: ctx.store,
    storage,
    hasTokens: async () => (await client.currentTokens()) !== null,
    setSyncSession: s => sync.push(s),
  });
  await session.restore();
  return {...ctx, repo, storage, tokens, session, sync, calls, setUser: (u: typeof nextUser) => (nextUser = u), revoked: () => revoked};
}

describe('session', () => {
  it('démarre sans choix, puis mode local', async () => {
    const {session, store} = await sessionSetup();
    expect(session.getSnapshot()).toEqual({ready: true, choice: null, state: 'none', user: null});
    await session.continueWithoutAccount();
    expect(session.getSnapshot().choice).toBe('local');
    expect(await store.getKv('session.choice')).toBe('local');
  });

  it('crée un compte et relie les données locales', async () => {
    const {session, repo, tokens, sync, calls} = await sessionSetup();
    const goal = await repo.tables.goals.insert({title: 'Avant le compte'});
    await session.register({fullName: 'Marc', phone: '+237690000001', password: 'secret123'});
    expect(session.getSnapshot().state).toBe('active');
    expect(session.getSnapshot().user?.fullName).toBe('Marc');
    expect(tokens.value).toEqual(pair(1));
    expect(sync[sync.length - 1]).toBe('active');
    expect((calls[0].body as {deviceId: string}).deviceId.length).toBe(36);
    const row = await repo.tables.goals.get(goal.id);
    expect(row?.dirty).toBe(true);
    expect(row?.version).toBe(0);
  });

  it('restaure une session active ou expirée', async () => {
    const a = await sessionSetup();
    await a.session.login({phone: '+237690000001', password: 'secret123'});
    const again = new SessionService({
      auth: createAuthApi(new ApiClient({baseUrl: () => 'x', tokens: a.tokens, fetchImpl: async () => ({status: 204, text: async () => ''})})),
      store: a.store,
      storage: a.storage,
      hasTokens: async () => a.tokens.value !== null,
      setSyncSession: () => undefined,
    });
    await again.restore();
    expect(again.getSnapshot().state).toBe('active');
    a.tokens.value = null;
    await again.restore();
    expect(again.getSnapshot().state).toBe('expired');
  });

  it('refuse un autre compte sans confirmation, puis remplace les données', async () => {
    const s = await sessionSetup();
    await s.session.login({phone: '+237690000001', password: 'secret123'});
    await s.session.logout();
    expect(s.session.getSnapshot().choice).toBeNull();
    const goal = await s.repo.tables.goals.insert({title: 'Données du compte 1'});
    s.setUser({id: 'u2', fullName: 'Autre', phone: '+237690000002'});
    await expect(s.session.login({phone: '+237690000002', password: 'secret123'})).rejects.toThrow(AccountMismatchError);
    expect(await s.repo.tables.goals.get(goal.id)).not.toBeNull();
    await s.session.login({phone: '+237690000002', password: 'secret123'}, true);
    expect(await s.repo.tables.goals.get(goal.id)).toBeNull();
    expect(s.session.getSnapshot().user?.id).toBe('u2');
  });

  it('conserve les données en se reconnectant au même compte', async () => {
    const s = await sessionSetup();
    await s.session.login({phone: '+237690000001', password: 'x'});
    const goal = await s.repo.tables.goals.insert({title: 'A'});
    await s.session.logout();
    expect(await s.tokens.value).toBeNull();
    await s.session.login({phone: '+237690000001', password: 'x'});
    expect(await s.repo.tables.goals.get(goal.id)).not.toBeNull();
  });

  it('détecte un autre identifiant pour le même numéro et révoque la session', async () => {
    const s = await sessionSetup();
    await s.session.login({phone: '+237690000001', password: 'x'});
    await s.session.logout();
    const before = s.revoked();
    s.setUser({id: 'u9', fullName: 'Autre', phone: '+237690000001'});
    await expect(s.session.login({phone: '+237690000001', password: 'x'})).rejects.toThrow(AccountMismatchError);
    expect(s.revoked()).toBe(before + 1);
  });

  it('supprime le compte et garde les données en local', async () => {
    const s = await sessionSetup();
    await s.session.login({phone: '+237690000001', password: 'x'});
    const goal = await s.repo.tables.goals.insert({title: 'A'});
    await s.session.deleteAccount('x');
    expect(s.session.getSnapshot()).toEqual({ready: true, choice: 'local', state: 'none', user: null});
    const row = await s.repo.tables.goals.get(goal.id);
    expect(row?.version).toBe(0);
    expect(row?.dirty).toBe(true);
    expect(s.tokens.value).toBeNull();
  });

  it('passe en expirée', async () => {
    const s = await sessionSetup();
    await s.session.login({phone: '+237690000001', password: 'x'});
    s.session.markExpired();
    expect(s.session.getSnapshot().state).toBe('expired');
    expect(s.sync[s.sync.length - 1]).toBe('expired');
  });
});
