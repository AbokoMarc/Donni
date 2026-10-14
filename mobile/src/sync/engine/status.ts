export type SessionState = 'none' | 'active' | 'expired';

export type SyncStatus =
  | 'local'
  | 'expired'
  | 'syncing'
  | 'offline'
  | 'conflicts'
  | 'error'
  | 'synced';

export interface StatusInput {
  session: SessionState;
  online: boolean;
  syncing: boolean;
  conflicts: number;
  failed: boolean;
}

export function deriveSyncStatus(input: StatusInput): SyncStatus {
  if (input.session === 'none') {
    return 'local';
  }
  if (input.session === 'expired') {
    return 'expired';
  }
  if (input.syncing) {
    return 'syncing';
  }
  if (!input.online) {
    return 'offline';
  }
  if (input.conflicts > 0) {
    return 'conflicts';
  }
  if (input.failed) {
    return 'error';
  }
  return 'synced';
}

export function statusLabel(status: SyncStatus, conflicts = 0): string {
  switch (status) {
    case 'local':
      return 'Enregistré sur ce téléphone';
    case 'expired':
      return 'Session expirée';
    case 'syncing':
      return 'Synchronisation…';
    case 'offline':
      return 'Hors connexion';
    case 'conflicts':
      return `Conflits à résoudre (${conflicts})`;
    case 'error':
      return 'Synchronisation impossible pour le moment';
    default:
      return 'Synchronisé';
  }
}
