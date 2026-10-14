import type {EntityName} from '../domain/types';
import type {ChangeBus} from './bus';

export interface QueryState<T> {
  status: 'loading' | 'ready' | 'error';
  data: T | undefined;
  error: unknown;
}

/**
 * Requête dont le résultat est relu à chaque écriture sur les entités suivies.
 * `subscribe` et `getSnapshot` ont l'identité stable exigée par useSyncExternalStore.
 */
export class LiveQuery<T> {
  private state: QueryState<T> = {status: 'loading', data: undefined, error: null};
  private listeners = new Set<() => void>();
  private unsubscribeBus: (() => void) | null = null;
  private token = 0;
  private running = false;
  private again = false;
  private readonly bus: ChangeBus;
  private readonly entities: readonly EntityName[];
  private readonly fetcher: () => Promise<T>;

  constructor(bus: ChangeBus, entities: readonly EntityName[], fetcher: () => Promise<T>) {
    this.bus = bus;
    this.entities = entities;
    this.fetcher = fetcher;
  }

  getSnapshot = (): QueryState<T> => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.unsubscribeBus = this.bus.subscribe(this.entities, () => {
        void this.refresh();
      });
      void this.refresh();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.token += 1;
        this.unsubscribeBus?.();
        this.unsubscribeBus = null;
      }
    };
  };

  async refresh(): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      do {
        this.again = false;
        const token = ++this.token;
        try {
          const data = await this.fetcher();
          if (token === this.token) {
            this.state = {status: 'ready', data, error: null};
            this.notify();
          }
        } catch (error) {
          if (token === this.token) {
            this.state = {status: 'error', data: this.state.data, error};
            this.notify();
          }
        }
      } while (this.again && this.listeners.size > 0);
    } finally {
      this.running = false;
    }
  }

  private notify(): void {
    for (const l of Array.from(this.listeners)) {
      l();
    }
  }
}
