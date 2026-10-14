import * as Keychain from 'react-native-keychain';
import type {TokenStore} from './client';
import type {TokenPair} from './types';

const SERVICE = 'donni.tokens';

export const keychainTokenStore: TokenStore = {
  async load(): Promise<TokenPair | null> {
    const entry = await Keychain.getGenericPassword({service: SERVICE});
    if (!entry) {
      return null;
    }
    try {
      const parsed = JSON.parse(entry.password) as Partial<TokenPair>;
      return parsed.accessToken && parsed.refreshToken
        ? {accessToken: parsed.accessToken, refreshToken: parsed.refreshToken}
        : null;
    } catch {
      return null;
    }
  },
  async save(tokens: TokenPair): Promise<void> {
    await Keychain.setGenericPassword('donni', JSON.stringify(tokens), {
      service: SERVICE,
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK,
    });
  },
  async clear(): Promise<void> {
    await Keychain.resetGenericPassword({service: SERVICE});
  },
};
