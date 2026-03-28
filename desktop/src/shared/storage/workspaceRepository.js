import {
  WORKSPACE_STORAGE_KEY,
  WORKSPACE_STORAGE_VERSION,
  createSeedWorkspaceSnapshot,
  createWorkspaceFile,
  createWorkspaceIdea,
  createWorkspaceProject,
  createWorkspaceTask,
  normalizeGitHubIntegrationState,
  normalizeJakalFlowIntegrationState,
  normalizeWorkspaceSnapshotV3,
  WorkspaceRouteKeys,
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

function normalizeProviderKey(providerKey) {
  if (providerKey === "jakal_flow" || providerKey === "jakalFlow") {
    return "jakalFlow";
  }

  if (providerKey === "github") {
    return "github";
  }

  throw new Error(`Unknown integration provider: ${providerKey}`);
}

function getEntityCollectionKey(entityType) {
  switch (entityType) {
    case "project":
      return "projects";
    case "task":
      return "tasks";
    case "idea":
      return "ideas";
    case "file":
      return "files";
    default:
      throw new Error(`Unknown workspace entity type: ${entityType}`);
  }
}

function createEntityRecord(entityType, input, context = {}) {
  switch (entityType) {
    case "project":
      return createWorkspaceProject(input, { now: context.now });
    case "task":
      return createWorkspaceTask(input, {
        now: context.now,
        fallbackOrder: context.fallbackOrder ?? 0,
      });
    case "idea":
      return createWorkspaceIdea(input, { now: context.now });
    case "file":
      return createWorkspaceFile(input, {
        now: context.now,
        defaultKind: context.defaultKind ?? "document",
      });
    default:
      throw new Error(`Unknown workspace entity type: ${entityType}`);
  }
}

function normalizeIntegrationState(providerKey, input = {}, now = new Date().toISOString()) {
  if (providerKey === "jakalFlow") {
    return normalizeJakalFlowIntegrationState(input, { now });
  }

  return normalizeGitHubIntegrationState(input, { now });
}

function collectDescendantFileIds(files, fileId) {
  const byParentId = new Map();

  files.forEach((file) => {
    const parentId = file.parentId ?? null;
    if (!byParentId.has(parentId)) {
      byParentId.set(parentId, []);
    }

    byParentId.get(parentId).push(file.id);
  });

  const ids = new Set([fileId]);
  const queue = [fileId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    const childIds = byParentId.get(currentId) ?? [];

    childIds.forEach((childId) => {
      if (!ids.has(childId)) {
        ids.add(childId);
        queue.push(childId);
      }
    });
  }

  return ids;
}

const defaultWorkspaceMigrations = Object.freeze([
  Object.freeze({
    version: 2,
    up: normalizeWorkspaceSnapshotV3,
  }),
  Object.freeze({
    version: WORKSPACE_STORAGE_VERSION,
    up: normalizeWorkspaceSnapshotV3,
  }),
]);

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
    this.migrations = sortMigrations([
      ...defaultWorkspaceMigrations,
      ...migrations,
    ]);
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
    const normalizedSnapshot = normalizeWorkspaceSnapshotV3(snapshot);
    const nextSnapshot = {
      ...normalizedSnapshot,
      meta: {
        ...normalizedSnapshot.meta,
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
    return this.replaceSnapshot(createSeedWorkspaceSnapshot());
  }

  updateNavigation(routeKey) {
    const nextRoute = WorkspaceRouteKeys.includes(routeKey)
      ? routeKey
      : WorkspaceRouteKeys[0];

    return this.writeSnapshot((currentSnapshot) => ({
      ...currentSnapshot,
      navigation: {
        ...currentSnapshot.navigation,
        lastRoute: nextRoute,
      },
    }));
  }

  createProject(projectInput = {}) {
    return this.#createEntity("project", projectInput);
  }

  updateProject(projectId, updates = {}) {
    return this.#updateEntity("project", projectId, updates);
  }

  deleteProject(projectId) {
    return this.#deleteEntity("project", projectId);
  }

  createTask(taskInput = {}) {
    return this.#createEntity("task", taskInput);
  }

  updateTask(taskId, updates = {}) {
    return this.#updateEntity("task", taskId, updates);
  }

  deleteTask(taskId) {
    return this.#deleteEntity("task", taskId);
  }

  createIdea(ideaInput = {}) {
    return this.#createEntity("idea", ideaInput);
  }

  updateIdea(ideaId, updates = {}) {
    return this.#updateEntity("idea", ideaId, updates);
  }

  deleteIdea(ideaId) {
    return this.#deleteEntity("idea", ideaId);
  }

  promoteIdeaToProject(ideaId, projectInput = {}) {
    return this.writeSnapshot((currentSnapshot) => {
      const idea = currentSnapshot.ideas.find((entry) => entry.id === ideaId);
      if (!idea) {
        throw new Error(`Unknown idea id: ${ideaId}`);
      }

      const now = new Date().toISOString();
      const project = createEntityRecord(
        "project",
        {
          title: idea.title,
          summary: idea.summary,
          ...projectInput,
          ideaIds: [...(projectInput.ideaIds ?? []), idea.id],
          fileIds: [...idea.fileIds, ...(projectInput.fileIds ?? [])],
        },
        { now },
      );

      return {
        ...currentSnapshot,
        projects: [...currentSnapshot.projects, project],
        ideas: currentSnapshot.ideas.map((entry) =>
          entry.id === ideaId
            ? createEntityRecord(
                "idea",
                {
                  ...entry,
                  stage: "promoted",
                  projectIds: [...entry.projectIds, project.id],
                  promotedProjectId: project.id,
                  updatedAt: now,
                },
                { now },
              )
            : entry,
        ),
      };
    });
  }

  createFile(fileInput = {}) {
    return this.#createEntity("file", fileInput);
  }

  updateFile(fileId, updates = {}) {
    return this.#updateEntity("file", fileId, updates);
  }

  moveFile(fileId, nextParentId = null) {
    if (nextParentId === fileId) {
      throw new Error("A file cannot be its own parent.");
    }

    return this.updateFile(fileId, { parentId: nextParentId });
  }

  deleteFile(fileId, { cascade = true } = {}) {
    return this.writeSnapshot((currentSnapshot) => {
      const existingFile = currentSnapshot.files.find((entry) => entry.id === fileId);
      if (!existingFile) {
        throw new Error(`Unknown file id: ${fileId}`);
      }

      const removedIds = cascade
        ? collectDescendantFileIds(currentSnapshot.files, fileId)
        : new Set([fileId]);
      const reparentTo = cascade ? null : existingFile.parentId;

      return {
        ...currentSnapshot,
        fileHierarchy: {
          ...currentSnapshot.fileHierarchy,
          rootFileIds: currentSnapshot.fileHierarchy.rootFileIds.filter(
            (rootFileId) => !removedIds.has(rootFileId),
          ),
        },
        files: currentSnapshot.files
          .filter((file) => !removedIds.has(file.id))
          .map((file) =>
            file.parentId === fileId
              ? {
                  ...file,
                  parentId: reparentTo,
                }
              : file,
          ),
      };
    });
  }

  assignTaskToProject(taskId, projectId = null) {
    return this.updateTask(taskId, { projectId });
  }

  assignTaskToIdea(taskId, ideaId = null) {
    return this.updateTask(taskId, { ideaId });
  }

  replaceJakalFlowIntegration(integrationInput = {}) {
    return this.#replaceIntegration("jakalFlow", integrationInput);
  }

  replaceGitHubIntegration(integrationInput = {}) {
    return this.#replaceIntegration("github", integrationInput);
  }

  upsertIntegrationRecord(providerKey, recordInput = {}) {
    const normalizedProviderKey = normalizeProviderKey(providerKey);

    return this.writeSnapshot((currentSnapshot) => {
      const integrationState = currentSnapshot.integrations[normalizedProviderKey];
      const recordId = recordInput.id;
      const existingIndex = recordId
        ? integrationState.records.findIndex((record) => record.id === recordId)
        : -1;
      const currentRecord =
        existingIndex >= 0 ? integrationState.records[existingIndex] : null;
      const nextRecord = {
        ...currentRecord,
        ...recordInput,
      };
      const nextRecords =
        existingIndex >= 0
          ? integrationState.records.map((record, index) =>
              index === existingIndex ? nextRecord : record,
            )
          : [
              ...integrationState.records,
              {
                ...nextRecord,
                provider:
                  nextRecord.provider ??
                  (normalizedProviderKey === "jakalFlow" ? "jakal_flow" : "github"),
              },
            ];

      return {
        ...currentSnapshot,
        integrations: {
          ...currentSnapshot.integrations,
          [normalizedProviderKey]: {
            ...integrationState,
            records: nextRecords,
            syncedAt: new Date().toISOString(),
          },
        },
      };
    });
  }

  removeIntegrationRecord(providerKey, recordId) {
    const normalizedProviderKey = normalizeProviderKey(providerKey);

    return this.writeSnapshot((currentSnapshot) => ({
      ...currentSnapshot,
      integrations: {
        ...currentSnapshot.integrations,
        [normalizedProviderKey]: {
          ...currentSnapshot.integrations[normalizedProviderKey],
          records: currentSnapshot.integrations[normalizedProviderKey].records.filter(
            (record) => record.id !== recordId,
          ),
          syncedAt: new Date().toISOString(),
        },
      },
    }));
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
    const migratedSnapshot = this.migrations.reduce((currentSnapshot, migration) => {
      if (migration.version <= startingVersion) {
        return currentSnapshot;
      }

      return migration.up(currentSnapshot);
    }, snapshot);
    const normalizedSnapshot = normalizeWorkspaceSnapshotV3(migratedSnapshot);
    const shouldPersist =
      startingVersion !== this.schemaVersion ||
      JSON.stringify(normalizedSnapshot) !== JSON.stringify(migratedSnapshot);

    if (shouldPersist) {
      return this.replaceSnapshot({
        ...normalizedSnapshot,
        meta: {
          ...normalizedSnapshot.meta,
          schemaVersion: this.schemaVersion,
        },
      });
    }

    return normalizedSnapshot;
  }

  #createEntity(entityType, entityInput = {}) {
    return this.writeSnapshot((currentSnapshot) => {
      const collectionKey = getEntityCollectionKey(entityType);
      const existingCollection = currentSnapshot[collectionKey];
      const now = new Date().toISOString();
      const nextEntity = createEntityRecord(entityType, entityInput, {
        now,
        fallbackOrder:
          entityType === "task"
            ? entityInput.order ?? existingCollection.length
            : undefined,
        defaultKind:
          entityType === "file" ? entityInput.kind ?? "document" : undefined,
      });

      return {
        ...currentSnapshot,
        [collectionKey]: [...existingCollection, nextEntity],
      };
    });
  }

  #updateEntity(entityType, entityId, updates = {}) {
    return this.writeSnapshot((currentSnapshot) => {
      const collectionKey = getEntityCollectionKey(entityType);
      const existingCollection = currentSnapshot[collectionKey];
      const existingIndex = existingCollection.findIndex(
        (entry) => entry.id === entityId,
      );

      if (existingIndex < 0) {
        throw new Error(`Unknown ${entityType} id: ${entityId}`);
      }

      const existingEntity = existingCollection[existingIndex];
      const now = new Date().toISOString();
      const nextEntity = createEntityRecord(
        entityType,
        {
          ...existingEntity,
          ...updates,
          id: existingEntity.id,
          createdAt: existingEntity.createdAt,
          updatedAt: now,
        },
        {
          now,
          fallbackOrder:
            entityType === "task"
              ? updates.order ?? existingEntity.order ?? existingIndex
              : undefined,
          defaultKind:
            entityType === "file"
              ? updates.kind ?? existingEntity.kind ?? "document"
              : undefined,
        },
      );

      return {
        ...currentSnapshot,
        [collectionKey]: existingCollection.map((entry, index) =>
          index === existingIndex ? nextEntity : entry,
        ),
      };
    });
  }

  #deleteEntity(entityType, entityId) {
    return this.writeSnapshot((currentSnapshot) => {
      const collectionKey = getEntityCollectionKey(entityType);
      const existingCollection = currentSnapshot[collectionKey];
      if (!existingCollection.some((entry) => entry.id === entityId)) {
        throw new Error(`Unknown ${entityType} id: ${entityId}`);
      }

      return {
        ...currentSnapshot,
        [collectionKey]: existingCollection.filter((entry) => entry.id !== entityId),
      };
    });
  }

  #replaceIntegration(providerKey, integrationInput = {}) {
    const normalizedProviderKey = normalizeProviderKey(providerKey);

    return this.writeSnapshot((currentSnapshot) => ({
      ...currentSnapshot,
      integrations: {
        ...currentSnapshot.integrations,
        [normalizedProviderKey]: normalizeIntegrationState(
          normalizedProviderKey,
          {
            ...currentSnapshot.integrations[normalizedProviderKey],
            ...integrationInput,
            records:
              integrationInput.records ??
              currentSnapshot.integrations[normalizedProviderKey].records,
          },
          new Date().toISOString(),
        ),
      },
    }));
  }

  #notify() {
    this.listeners.forEach((listener) => listener());
  }
}

/**
 * WorkspaceIntegrationAdapter is the only shared boundary allowed to accept
 * external sync payloads before they are normalized into WorkspaceSnapshot v3.
 */
export class WorkspaceIntegrationAdapter {
  constructor(repository) {
    this.repository = repository;
  }

  applyJakalFlowSync(syncInput = {}) {
    return this.repository.replaceJakalFlowIntegration(syncInput);
  }

  applyGitHubSync(syncInput = {}) {
    return this.repository.replaceGitHubIntegration(syncInput);
  }
}

export function createWorkspaceRepository(options) {
  return new WorkspaceRepository(options);
}

export function createWorkspaceIntegrationAdapter(repository) {
  return new WorkspaceIntegrationAdapter(repository);
}
