import type {EntityName} from '../../domain/types';
import type {Dict, ServerState} from './types';

export type ConflictChoice = 'mine' | 'server';

export interface ConflictRecord {
  id: number;
  entity: EntityName;
  entityId: string;
  local: {version: number; deleted: boolean; data: Dict};
  server: ServerState;
  createdAt: string;
}

export type Resolution =
  | {kind: 'rebase'; version: number}
  | {kind: 'overwrite'; version: number; data: Dict}
  | {kind: 'purge'};

/** Garder ma version : la ligne locale repart de la version du serveur et sera renvoyée, donc acceptée. */
export function resolveConflict(
  conflict: Pick<ConflictRecord, 'server'>,
  choice: ConflictChoice,
): Resolution {
  if (choice === 'mine') {
    return {kind: 'rebase', version: conflict.server.version};
  }
  if (conflict.server.deleted) {
    return {kind: 'purge'};
  }
  return {kind: 'overwrite', version: conflict.server.version, data: conflict.server.data};
}
