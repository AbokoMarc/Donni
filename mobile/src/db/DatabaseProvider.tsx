import React, {createContext, useContext, useMemo, useSyncExternalStore} from 'react';
import type {ReactNode} from 'react';
import type {EntityName} from '../domain/types';
import {LiveQuery} from './liveQuery';
import type {QueryState} from './liveQuery';
import type {Queries} from './queries';
import type {Repository} from './repository';

const RepositoryContext = createContext<Repository | null>(null);

export function DatabaseProvider({
  repository,
  children,
}: {
  repository: Repository;
  children: ReactNode;
}) {
  return <RepositoryContext.Provider value={repository}>{children}</RepositoryContext.Provider>;
}

export function useRepository(): Repository {
  const repo = useContext(RepositoryContext);
  if (!repo) {
    throw new Error('useRepository doit être utilisé sous DatabaseProvider');
  }
  return repo;
}

/**
 * Relit la requête à chaque écriture sur `entities`. `deps` doit lister les valeurs
 * externes utilisées par `fetcher` (jour, filtre...), comme pour useMemo.
 */
export function useLiveQuery<T>(
  entities: readonly EntityName[],
  fetcher: (q: Queries, repo: Repository) => Promise<T>,
  deps: readonly unknown[] = [],
): QueryState<T> {
  const repo = useRepository();
  const query = useMemo(
    () => new LiveQuery<T>(repo.bus, entities, () => fetcher(repo.q, repo)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repo, ...deps],
  );
  return useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
}
