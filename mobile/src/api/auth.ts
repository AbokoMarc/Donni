import type {ApiClient} from './client';
import type {AuthResponse, Me} from './types';

export interface RegisterInput {
  fullName: string;
  phone: string;
  password: string;
  deviceId?: string;
}

export interface LoginInput {
  phone: string;
  password: string;
  deviceId?: string;
}

export interface AuthApi {
  register(input: RegisterInput): Promise<AuthResponse>;
  login(input: LoginInput): Promise<AuthResponse>;
  logout(): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  forgotPassword(phone: string): Promise<void>;
  resetPassword(phone: string, code: string, newPassword: string): Promise<void>;
  deleteAccount(password: string): Promise<void>;
  me(): Promise<Me>;
}

export function createAuthApi(client: ApiClient): AuthApi {
  const adopt = async (response: AuthResponse): Promise<AuthResponse> => {
    await client.setTokens({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
    });
    return response;
  };

  return {
    async register(input) {
      return adopt(await client.request<AuthResponse>('POST', '/auth/register', {body: input, auth: false}));
    },
    async login(input) {
      return adopt(await client.request<AuthResponse>('POST', '/auth/login', {body: input, auth: false}));
    },
    async logout() {
      const tokens = await client.currentTokens();
      try {
        if (tokens) {
          await client.request<void>('POST', '/auth/logout', {
            body: {refreshToken: tokens.refreshToken},
            auth: false,
          });
        }
      } finally {
        await client.clearTokens();
      }
    },
    changePassword(currentPassword, newPassword) {
      return client.request<void>('POST', '/auth/password/change', {
        body: {currentPassword, newPassword},
      });
    },
    forgotPassword(phone) {
      return client.request<void>('POST', '/auth/password/forgot', {body: {phone}, auth: false});
    },
    resetPassword(phone, code, newPassword) {
      return client.request<void>('POST', '/auth/password/reset', {
        body: {phone, code, newPassword},
        auth: false,
      });
    },
    async deleteAccount(password) {
      await client.request<void>('DELETE', '/auth/account', {body: {password}});
      await client.clearTokens();
    },
    me() {
      return client.request<Me>('GET', '/auth/me');
    },
  };
}
