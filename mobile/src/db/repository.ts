import {applyInteraction} from '../domain/network';
import {nowIso} from '../domain/dates';
import type {Placement} from '../domain/time';
import type {
  ContactInteraction,
  Entity,
  EntityData,
  EntityName,
  HabitLog,
  InteractionChannel,
  Insertable,
  Settings,
  SettingsData,
  TaskStatus,
} from '../domain/types';
import type {ChangeBus} from './bus';
import {ENTITY_NAMES} from './entities';
import {createQueries} from './queries';
import type {Queries} from './queries';
import type {DataStore, SelectQuery} from './store';

export interface EntityRepository<K extends EntityName> {
  list(query?: SelectQuery): Promise<Entity<K>[]>;
  get(id: string): Promise<Entity<K> | null>;
  count(where?: string, params?: Array<string | number>): Promise<number>;
  insert(input: Insertable<K>): Promise<Entity<K>>;
  update(id: string, patch: Partial<EntityData[K]>): Promise<Entity<K> | null>;
  upsert(input: Insertable<K> & {id: string}): Promise<Entity<K>>;
  softDelete(id: string): Promise<boolean>;
}

export interface Repository extends RepositoryActions {
  readonly tables: {[K in EntityName]: EntityRepository<K>};
  readonly q: Queries;
  readonly store: DataStore;
  readonly bus: ChangeBus;
}

export interface RepositoryActions {
  saveSettings(patch: Partial<SettingsData>): Promise<Settings>;
  recordInteraction(
    contactId: string,
    channel: InteractionChannel,
    at?: Date,
    note?: string | null,
  ): Promise<ContactInteraction>;
  setHabitCount(habitId: string, day: string, count: number): Promise<HabitLog>;
  applyPlacements(placements: readonly Placement[]): Promise<void>;
  setTaskStatus(id: string, status: TaskStatus): Promise<void>;
}

function tableRepository<K extends EntityName>(store: DataStore, entity: K): EntityRepository<K> {
  return {
    list: query => store.select(entity, query),
    get: id => store.get(entity, id),
    count: (where, params) => store.count(entity, where, params),
    insert: input => store.insert(entity, input),
    update: (id, patch) => store.update(entity, id, patch),
    upsert: input => store.upsert(entity, input),
    softDelete: id => store.softDelete(entity, id),
  };
}

export function createRepository(store: DataStore): Repository {
  const tables = {} as {[K in EntityName]: EntityRepository<K>};
  for (const name of ENTITY_NAMES) {
    (tables as Record<string, unknown>)[name] = tableRepository(store, name);
  }
  const q = createQueries(store);

  return {
    tables,
    q,
    store,
    bus: store.bus,

    saveSettings: patch =>
      store.transaction(async tx => {
        const rows = await tx.select('settings', {orderBy: '"updated_at" DESC', limit: 1});
        if (rows[0]) {
          return (await tx.update('settings', rows[0].id, patch)) as Settings;
        }
        return tx.insert('settings', patch);
      }),

    recordInteraction: (contactId, channel, at = new Date(), note = null) =>
      store.transaction(async tx => {
        const contact = await tx.get('contacts', contactId);
        if (!contact) {
          throw new Error('Contact introuvable');
        }
        const interaction = await tx.insert('contactInteractions', {
          contactId,
          channel,
          at: nowIso(at),
          note,
        });
        await tx.update('contacts', contactId, applyInteraction(contact, at));
        return interaction;
      }),

    setHabitCount: (habitId, day, count) =>
      store.transaction(async tx => {
        const rows = await tx.select('habitLogs', {
          where: '"habit_id" = ? AND "day" = ?',
          params: [habitId, day],
          limit: 1,
        });
        if (rows[0]) {
          return (await tx.update('habitLogs', rows[0].id, {count})) as HabitLog;
        }
        return tx.insert('habitLogs', {habitId, day, count});
      }),

    applyPlacements: placements =>
      store.transaction(async tx => {
        for (const p of placements) {
          await tx.update('tasks', p.id, {
            startTime: p.startTime,
            endTime: p.endTime,
            position: p.position,
          });
        }
      }),

    setTaskStatus: async (id, status) => {
      await store.update('tasks', id, {status});
    },
  };
}
