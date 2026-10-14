import type {EntityName} from '../../domain/types';

export type Dict = Record<string, unknown>;

export const MAX_BATCH = 200;

export interface SyncChange {
  entity: EntityName;
  id: string;
  baseVersion: number;
  deleted: boolean;
  data: Dict;
}

export interface SyncRequest {
  cursor: number;
  deviceId: string;
  changes: SyncChange[];
}

export interface ServerState {
  version: number;
  deleted: boolean;
  data: Dict;
}

export interface ServerChange extends ServerState {
  entity: string;
  id: string;
}

export interface SyncResponse {
  cursor: number;
  hasMore: boolean;
  applied: Array<{entity: string; id: string; version: number}>;
  conflicts: Array<{entity: string; id: string; server: ServerState}>;
  changes: ServerChange[];
}

export interface DirtyRow {
  entity: EntityName;
  record: Dict & {id: string; version: number; localSeq: number; deletedAt: string | null};
}

export interface SentRef {
  entity: EntityName;
  id: string;
  localSeq: number;
}

export interface LocalSnapshot {
  version: number;
  dirty: boolean;
  localSeq: number;
  deleted: boolean;
}

export const keyOf = (entity: string, id: string): string => `${entity}:${id}`;
