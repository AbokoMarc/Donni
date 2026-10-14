import {isEntityName} from '../../db/entities';
import type {EntityName} from '../../domain/types';
import {keyOf} from './types';
import type {Dict, LocalSnapshot, SentRef, ServerState, SyncResponse} from './types';

export interface AckOp {
  entity: EntityName;
  id: string;
  version: number;
  keepDirty: boolean;
  purge: boolean;
}

export interface WriteOp {
  entity: EntityName;
  id: string;
  version: number;
  data: Dict;
}

export interface PurgeOp {
  entity: EntityName;
  id: string;
}

export interface ConflictOp {
  entity: EntityName;
  id: string;
  server: ServerState;
}

export interface ApplyPlan {
  acks: AckOp[];
  writes: WriteOp[];
  purges: PurgeOp[];
  conflicts: ConflictOp[];
}

export function keysToInspect(
  response: SyncResponse,
  sent: readonly SentRef[],
): Array<{entity: EntityName; id: string}> {
  const out = new Map<string, {entity: EntityName; id: string}>();
  const add = (entity: string, id: string): void => {
    if (isEntityName(entity)) {
      out.set(keyOf(entity, id), {entity, id});
    }
  };
  for (const s of sent) {
    add(s.entity, s.id);
  }
  for (const a of response.applied) {
    add(a.entity, a.id);
  }
  for (const c of response.conflicts) {
    add(c.entity, c.id);
  }
  for (const c of response.changes) {
    add(c.entity, c.id);
  }
  return Array.from(out.values());
}

/**
 * Transforme une réponse du serveur en opérations locales, sans écrire :
 * acquittements, états serveur à recopier, suppressions à purger, conflits à conserver.
 */
export function planApply(
  response: SyncResponse,
  sent: readonly SentRef[],
  local: ReadonlyMap<string, LocalSnapshot>,
): ApplyPlan {
  const plan: ApplyPlan = {acks: [], writes: [], purges: [], conflicts: []};
  const sentByKey = new Map(sent.map(s => [keyOf(s.entity, s.id), s]));

  for (const applied of response.applied) {
    if (!isEntityName(applied.entity)) {
      continue;
    }
    const key = keyOf(applied.entity, applied.id);
    const snap = local.get(key);
    const ref = sentByKey.get(key);
    if (!snap || !ref) {
      continue;
    }
    const keepDirty = snap.localSeq !== ref.localSeq;
    plan.acks.push({
      entity: applied.entity,
      id: applied.id,
      version: applied.version,
      keepDirty,
      purge: !keepDirty && snap.deleted,
    });
  }

  for (const conflict of response.conflicts) {
    if (isEntityName(conflict.entity)) {
      plan.conflicts.push({entity: conflict.entity, id: conflict.id, server: conflict.server});
    }
  }

  for (const change of response.changes) {
    if (!isEntityName(change.entity)) {
      continue;
    }
    const snap = local.get(keyOf(change.entity, change.id));
    if (snap && change.version <= snap.version) {
      continue;
    }
    if (snap && snap.dirty) {
      plan.conflicts.push({
        entity: change.entity,
        id: change.id,
        server: {version: change.version, deleted: change.deleted, data: change.data},
      });
    } else if (change.deleted) {
      if (snap) {
        plan.purges.push({entity: change.entity, id: change.id});
      }
    } else {
      plan.writes.push({
        entity: change.entity,
        id: change.id,
        version: change.version,
        data: change.data,
      });
    }
  }
  return plan;
}
