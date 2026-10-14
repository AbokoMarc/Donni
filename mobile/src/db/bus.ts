import type {EntityName} from '../domain/types';

export type WriteOrigin = 'user' | 'derive' | 'sync' | 'system';

export interface WriteEvent {
  entities: ReadonlySet<EntityName>;
  origin: WriteOrigin;
}

type EntityListener = (event: WriteEvent) => void;

interface Subscription {
  entities: ReadonlySet<EntityName> | null;
  listener: EntityListener;
}

export class ChangeBus {
  private subscriptions = new Set<Subscription>();

  /** `null` écoute toutes les entités. */
  subscribe(
    entities: readonly EntityName[] | null,
    listener: EntityListener,
  ): () => void {
    const sub: Subscription = {
      entities: entities ? new Set(entities) : null,
      listener,
    };
    this.subscriptions.add(sub);
    return () => {
      this.subscriptions.delete(sub);
    };
  }

  emit(entities: ReadonlySet<EntityName>, origin: WriteOrigin): void {
    if (entities.size === 0) {
      return;
    }
    const event: WriteEvent = {entities, origin};
    for (const sub of Array.from(this.subscriptions)) {
      if (!sub.entities || Array.from(entities).some(e => sub.entities?.has(e))) {
        try {
          sub.listener(event);
        } catch {
          // un abonné défaillant ne doit pas empêcher les autres d'être notifiés
        }
      }
    }
  }
}
