import {
  WORKSPACE_STORAGE_KEY,
  WORKSPACE_STORAGE_VERSION,
  createSeedWorkspaceSnapshot,
} from "../contracts/index.js";

function createMemoryStorage() {
  const cache = new Map();

  return {
    getItem(key) {
      return cache.has(key) ? cache.get(key) : null;
    },
    setItem(key, value) {
      cache.set(key, value);
    },
    removeItem(key) {
      cache.delete(key);
    },
  };
}

function resolveStorage(storageOverride) {
  if (storageOverride) {
    return storageOverride;
  }

  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }

  return createMemoryStorage();
}

function sortMigrations(migrations) {
  return [...migrations].sort((left, right) => left.version - right.version);
}

/**
 * WorkspaceRepository is the only shared UI write boundary for the desktop shell.
 */
export class WorkspaceRepository {
  constructor({
    storage = undefined,
    storageKey = WORKSPACE_STORAGE_KEY,
    schemaVersion = WORKSPACE_STORAGE_VERSION,
    migrations = [],
  } = {}) {
    this.storage = resolveStorage(storage);
    this.storageKey = storageKey;
    this.schemaVersion = schemaVersion;
    this.migrations = sortMigrations(migrations);
    this.listeners = new Set();
    this.snapshot = this.#loadSnapshot();
  }

  readSnapshot() {
    return this.snapshot;
  }

  writeSnapshot(updater) {
    const nextSnapshot = updater(this.snapshot);
    return this.replaceSnapshot(nextSnapshot);
  }

  replaceSnapshot(snapshot) {
    const nextSnapshot = {
      ...snapshot,
      meta: {
        ...snapshot.meta,
        schemaVersion: this.schemaVersion,
        updatedAt: new Date().toISOString(),
      },
    };

    this.snapshot = nextSnapshot;
    this.storage.setItem(this.storageKey, JSON.stringify(nextSnapshot));
    this.#notify();

    return nextSnapshot;
  }

  reset() {
    const seededSnapshot = createSeedWorkspaceSnapshot();
    return this.replaceSnapshot(seededSnapshot);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  #loadSnapshot() {
    const rawSnapshot = this.storage.getItem(this.storageKey);

    if (!rawSnapshot) {
      return this.reset();
    }

    try {
      const parsedSnapshot = JSON.parse(rawSnapshot);
      return this.#migrateSnapshot(parsedSnapshot);
    } catch (error) {
      return this.reset();
    }
  }

  #migrateSnapshot(snapshot) {
    const startingVersion = snapshot?.meta?.schemaVersion ?? 0;

    const migratedSnapshot = this.migrations.reduce(
      (currentSnapshot, migration) => {
        if (migration.version <= startingVersion) {
          return currentSnapshot;
        }

        return migration.up(currentSnapshot);
      },
      snapshot,
    );

    if (startingVersion !== this.schemaVersion) {
      return this.replaceSnapshot({
        ...migratedSnapshot,
        meta: {
          ...migratedSnapshot.meta,
          schemaVersion: this.schemaVersion,
        },
      });
    }

    return migratedSnapshot;
  }

  #notify() {
    this.listeners.forEach((listener) => listener());
  }
}

export function createWorkspaceRepository(options) {
  return new WorkspaceRepository(options);
}
