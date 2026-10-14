import type {AuthApi, LoginInput, RegisterInput} from '../api/auth';
import type {AuthResponse, AuthUser} from '../api/types';
import type {DataStore} from '../db/store';
import type {SessionState} from '../sync/engine/status';
import type {SyncStorage} from '../sync/SyncStorage';

export type OnboardingChoice = 'account' | 'local';

export interface SessionSnapshot {
  ready: boolean;
  choice: OnboardingChoice | null;
  state: SessionState;
  user: AuthUser | null;
}

export interface SessionDeps {
  auth: AuthApi;
  store: DataStore;
  storage: SyncStorage;
  hasTokens(): Promise<boolean>;
  setSyncSession(state: SessionState): void;
}

/** Les données du téléphone appartiennent à un autre compte : l'appelant doit demander confirmation. */
export class AccountMismatchError extends Error {
  constructor() {
    super('Les données de ce téléphone appartiennent à un autre compte.');
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'AccountMismatchError';
  }
}

const KV_CHOICE = 'session.choice';
const KV_USER = 'session.user';
const KV_OWNER = 'session.owner';

interface Owner {
  id: string;
  phone: string;
}

export class SessionService {
  private readonly deps: SessionDeps;
  private snapshot: SessionSnapshot = {ready: false, choice: null, state: 'none', user: null};
  private listeners = new Set<() => void>();

  constructor(deps: SessionDeps) {
    this.deps = deps;
  }

  getSnapshot = (): SessionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  async restore(): Promise<void> {
    const {store} = this.deps;
    const choice = (await store.getKv(KV_CHOICE)) as OnboardingChoice | null;
    const userJson = await store.getKv(KV_USER);
    const user = userJson ? (JSON.parse(userJson) as AuthUser) : null;
    let state: SessionState = 'none';
    if (choice === 'account' && user) {
      state = (await this.deps.hasTokens()) ? 'active' : 'expired';
    }
    this.set({ready: true, choice, state, user});
    this.deps.setSyncSession(state);
  }

  async continueWithoutAccount(): Promise<void> {
    await this.deps.store.setKv(KV_CHOICE, 'local');
    this.set({choice: 'local', state: 'none', user: null});
    this.deps.setSyncSession('none');
  }

  async register(input: Omit<RegisterInput, 'deviceId'>, replaceLocalData = false): Promise<void> {
    await this.guardOwner(input.phone, replaceLocalData);
    const {deviceId} = await this.deps.storage.readState();
    const response = await this.deps.auth.register({...input, deviceId});
    await this.adopt(response, replaceLocalData);
  }

  async login(input: Omit<LoginInput, 'deviceId'>, replaceLocalData = false): Promise<void> {
    await this.guardOwner(input.phone, replaceLocalData);
    const {deviceId} = await this.deps.storage.readState();
    const response = await this.deps.auth.login({...input, deviceId});
    await this.adopt(response, replaceLocalData);
  }

  /** Les données restent sur le téléphone ; seule la session est fermée. */
  async logout(): Promise<void> {
    try {
      await this.deps.auth.logout();
    } catch {
      // le serveur peut être injoignable : la session locale est fermée dans tous les cas
    }
    await this.deps.store.deleteKv(KV_CHOICE);
    await this.deps.store.deleteKv(KV_USER);
    this.set({choice: null, state: 'none', user: null});
    this.deps.setSyncSession('none');
  }

  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return this.deps.auth.changePassword(currentPassword, newPassword);
  }

  forgotPassword(phone: string): Promise<void> {
    return this.deps.auth.forgotPassword(phone);
  }

  resetPassword(phone: string, code: string, newPassword: string): Promise<void> {
    return this.deps.auth.resetPassword(phone, code, newPassword);
  }

  /** Supprime le compte serveur ; les données locales sont conservées comme données hors compte. */
  async deleteAccount(password: string): Promise<void> {
    await this.deps.auth.deleteAccount(password);
    await this.deps.storage.adoptLocalData();
    await this.deps.store.deleteKv(KV_OWNER);
    await this.deps.store.deleteKv(KV_USER);
    await this.deps.store.setKv(KV_CHOICE, 'local');
    this.set({choice: 'local', state: 'none', user: null});
    this.deps.setSyncSession('none');
  }

  markExpired(): void {
    if (this.snapshot.state === 'active') {
      this.set({state: 'expired'});
      this.deps.setSyncSession('expired');
    }
  }

  private async readOwner(): Promise<Owner | null> {
    const json = await this.deps.store.getKv(KV_OWNER);
    return json ? (JSON.parse(json) as Owner) : null;
  }

  private async guardOwner(phone: string, replaceLocalData: boolean): Promise<void> {
    const owner = await this.readOwner();
    if (owner && !replaceLocalData && owner.phone !== phone) {
      throw new AccountMismatchError();
    }
  }

  private async adopt(response: AuthResponse, replaceLocalData: boolean): Promise<void> {
    const {store, storage} = this.deps;
    const owner = await this.readOwner();
    const sameOwner = owner !== null && owner.id === response.user.id;
    if (owner && !sameOwner) {
      if (!replaceLocalData) {
        try {
          await this.deps.auth.logout();
        } catch {
          // la session créée ici est abandonnée, l'échec de révocation n'a pas d'incidence locale
        }
        throw new AccountMismatchError();
      }
      await storage.wipe();
    } else if (!owner) {
      await storage.adoptLocalData();
    }
    await store.setKv(KV_OWNER, JSON.stringify({id: response.user.id, phone: response.user.phone}));
    await store.setKv(KV_USER, JSON.stringify(response.user));
    await store.setKv(KV_CHOICE, 'account');
    this.set({choice: 'account', state: 'active', user: response.user});
    this.deps.setSyncSession('active');
  }

  private set(patch: Partial<SessionSnapshot>): void {
    this.snapshot = {...this.snapshot, ...patch};
    for (const l of Array.from(this.listeners)) {
      l();
    }
  }
}
