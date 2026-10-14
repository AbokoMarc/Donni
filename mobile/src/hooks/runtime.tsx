import React, {createContext, useContext, useEffect, useState, useSyncExternalStore} from 'react';
import type {ReactNode} from 'react';
import {toDay} from '../domain/dates';
import {DatabaseProvider} from '../db';
import type {SessionSnapshot} from '../auth/SessionService';
import type {Runtime} from '../runtime';
import type {SyncSnapshot} from '../sync';

const RuntimeContext = createContext<Runtime | null>(null);

export function RuntimeProvider({runtime, children}: {runtime: Runtime; children: ReactNode}) {
  return (
    <RuntimeContext.Provider value={runtime}>
      <DatabaseProvider repository={runtime.repo}>{children}</DatabaseProvider>
    </RuntimeContext.Provider>
  );
}

export function useRuntime(): Runtime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) {
    throw new Error('useRuntime doit être utilisé sous RuntimeProvider');
  }
  return runtime;
}

export function useSession(): SessionSnapshot {
  const {session} = useRuntime();
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
}

export function useSyncState(): SyncSnapshot {
  const {sync} = useRuntime();
  return useSyncExternalStore(sync.subscribe, sync.getSnapshot, sync.getSnapshot);
}

/** Date courante, rafraîchie à intervalle régulier (minute par défaut). */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function useToday(): string {
  return toDay(useNow());
}
