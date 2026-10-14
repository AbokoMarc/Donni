import {ApiError, AuthExpiredError, NetworkError} from './errors';
import type {ApiErrorBody} from './errors';
import type {TokenPair} from './types';

export interface FetchResponse {
  status: number;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: {method: string; headers: Record<string, string>; body?: string},
) => Promise<FetchResponse>;

export interface TokenStore {
  load(): Promise<TokenPair | null>;
  save(tokens: TokenPair): Promise<void>;
  clear(): Promise<void>;
}

export interface ClientOptions {
  baseUrl: () => string;
  tokens: TokenStore;
  fetchImpl: FetchLike;
  timeoutMs?: number;
  onSessionExpired?: () => void;
}

export interface RequestOptions {
  body?: unknown;
  auth?: boolean;
}

const DEFAULT_TIMEOUT_MS = 20_000;

export class ApiClient {
  private readonly options: ClientOptions;
  private cached: TokenPair | null | undefined;
  private refreshing: Promise<TokenPair> | null = null;

  constructor(options: ClientOptions) {
    this.options = options;
  }

  async currentTokens(): Promise<TokenPair | null> {
    if (this.cached === undefined) {
      this.cached = await this.options.tokens.load();
    }
    return this.cached;
  }

  async setTokens(tokens: TokenPair): Promise<void> {
    this.cached = tokens;
    await this.options.tokens.save(tokens);
  }

  async clearTokens(): Promise<void> {
    this.cached = null;
    await this.options.tokens.clear();
  }

  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const auth = opts.auth !== false;
    if (!auth) {
      return this.parse<T>(await this.send(method, path, opts.body, null));
    }
    const tokens = await this.currentTokens();
    if (!tokens) {
      throw new AuthExpiredError('Aucune session');
    }
    let res = await this.send(method, path, opts.body, tokens.accessToken);
    if (res.status === 401) {
      const fresh = await this.recoverFrom401(tokens.accessToken);
      res = await this.send(method, path, opts.body, fresh.accessToken);
    }
    return this.parse<T>(res);
  }

  private async recoverFrom401(usedAccess: string): Promise<TokenPair> {
    const current = await this.currentTokens();
    if (!current) {
      throw new AuthExpiredError();
    }
    if (current.accessToken !== usedAccess) {
      return current;
    }
    if (!this.refreshing) {
      this.refreshing = this.refresh(current.refreshToken).finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  private async refresh(refreshToken: string): Promise<TokenPair> {
    const res = await this.send('POST', '/auth/refresh', {refreshToken}, null);
    if (res.status >= 200 && res.status < 300) {
      const body = await this.parse<TokenPair>(res);
      const pair = {accessToken: body.accessToken, refreshToken: body.refreshToken};
      await this.setTokens(pair);
      return pair;
    }
    if (res.status >= 500 || res.status === 429) {
      throw new ApiError(res.status, await this.readError(res));
    }
    await this.clearTokens();
    this.options.onSessionExpired?.();
    throw new AuthExpiredError();
  }

  private async send(
    method: string,
    path: string,
    body: unknown,
    accessToken: string | null,
  ): Promise<FetchResponse> {
    const headers: Record<string, string> = {Accept: 'application/json'};
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    const url = `${this.options.baseUrl().replace(/\/+$/, '')}${path}`;
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let timer: unknown;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new NetworkError('Délai dépassé')), timeoutMs);
    });
    try {
      return await Promise.race([
        this.options.fetchImpl(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        timeout,
      ]);
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }
      throw new NetworkError();
    } finally {
      clearTimeout(timer);
    }
  }

  private async readError(res: FetchResponse): Promise<ApiErrorBody> {
    try {
      const text = await res.text();
      return text ? (JSON.parse(text) as ApiErrorBody) : {};
    } catch {
      return {};
    }
  }

  private async parse<T>(res: FetchResponse): Promise<T> {
    if (res.status >= 200 && res.status < 300) {
      if (res.status === 204) {
        return undefined as T;
      }
      const text = await res.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }
    throw new ApiError(res.status, await this.readError(res));
  }
}
