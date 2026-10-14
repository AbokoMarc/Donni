import {ENTITIES} from '../../db/entities';
import {toSyncData} from '../../db/mapping';
import {MAX_BATCH} from './types';
import type {DirtyRow, SentRef, SyncRequest} from './types';

export interface Batch {
  request: SyncRequest;
  sent: SentRef[];
}

/** Les modifications partent dans l'ordre de leur écriture locale, 200 au plus. */
export function buildBatch(
  dirty: readonly DirtyRow[],
  cursor: number,
  deviceId: string,
  limit: number = MAX_BATCH,
): Batch {
  const picked = dirty
    .slice()
    .sort((a, b) => a.record.localSeq - b.record.localSeq)
    .slice(0, Math.min(limit, MAX_BATCH));
  return {
    request: {
      cursor,
      deviceId,
      changes: picked.map(row => {
        const deleted = row.record.deletedAt !== null;
        return {
          entity: row.entity,
          id: row.record.id,
          baseVersion: row.record.version,
          deleted,
          data: deleted ? {} : toSyncData(ENTITIES[row.entity], row.record),
        };
      }),
    },
    sent: picked.map(row => ({
      entity: row.entity,
      id: row.record.id,
      localSeq: row.record.localSeq,
    })),
  };
}

export function emptyBatch(cursor: number, deviceId: string): Batch {
  return {request: {cursor, deviceId, changes: []}, sent: []};
}
