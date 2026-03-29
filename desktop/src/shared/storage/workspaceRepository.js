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

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function clampIndex(index, collectionLength) {
  if (!Number.isFinite(index)) {
    return collectionLength;
  }

  return Math.min(Math.max(Number(index), 0), collectionLength);
}

function removeFromCollection(collection, value) {
  return collection.filter((entry) => entry !== value);
}

function insertAtIndex(collection, value, index) {
  const nextCollection = removeFromCollection(collection, value);
  nextCollection.splice(clampIndex(index, nextCollection.length), 0, value);
  return nextCollection;
}

function moveCollectionEntryWithinGroups(
  collection,
  entryId,
  nextEntry,
  groupKey,
  groupOrder,
  nextIndex,
) {
  const orderedGroups = new Map(groupOrder.map((groupValue) => [groupValue, []]));
  const overflowGroups = new Map();

  collection.forEach((entry) => {
    if (entry.id === entryId) {
      return;
    }

    const groupValue = entry[groupKey];
    if (orderedGroups.has(groupValue)) {
      orderedGroups.get(groupValue).push(entry);
      return;
    }

    if (!overflowGroups.has(groupValue)) {
      overflowGroups.set(groupValue, []);
    }

    overflowGroups.get(groupValue).push(entry);
  });

  const targetGroupValue = nextEntry[groupKey];
  const targetGroupEntries = orderedGroups.has(targetGroupValue)
    ? orderedGroups.get(targetGroupValue)
    : overflowGroups.get(targetGroupValue) ?? [];
  const nextGroupEntries = insertAtIndex(targetGroupEntries, nextEntry, nextIndex);

  if (orderedGroups.has(targetGroupValue)) {
    orderedGroups.set(targetGroupValue, nextGroupEntries);
  } else {
    overflowGroups.set(targetGroupValue, nextGroupEntries);
  }

  return [
    ...groupOrder.flatMap((groupValue) => orderedGroups.get(groupValue) ?? []),
    ...[...overflowGroups.values()].flat(),
  ];
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

  moveProject(projectId, movement = {}) {
    return this.writeSnapshot((currentSnapshot) => {
      const { existingEntity: existingProject } = this.#getEntityContext(
        currentSnapshot,
        "project",
        projectId,
      );
      const hasStatus = hasOwn(movement, "status");
      const hasIndex = hasOwn(movement, "index");

      if (!hasStatus && !hasIndex) {
        return currentSnapshot;
      }

      const nextStatus = hasStatus ? movement.status : existingProject.status;
      const now = new Date().toISOString();
      const nextProject = this.#createUpdatedEntity(
        "project",
        existingProject,
        { status: nextStatus },
        0,
        now,
      );
      const currentIndex = currentSnapshot.projects
        .filter((entry) => entry.status === existingProject.status)
        .findIndex((entry) => entry.id === projectId);
      const nextIndex = hasIndex
        ? movement.index
        : nextProject.status === existingProject.status
          ? currentIndex
          : currentSnapshot.projects.filter((entry) => entry.status === nextProject.status)
              .length;

      return {
        ...currentSnapshot,
        projects: moveCollectionEntryWithinGroups(
          currentSnapshot.projects,
          projectId,
          nextProject,
          "status",
          currentSnapshot.boards.projects.statusOrder,
          nextIndex,
        ),
      };
    });
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

  moveTask(taskId, movement = {}) {
    return this.writeSnapshot((currentSnapshot) => {
      const { existingEntity: existingTask } = this.#getEntityContext(
        currentSnapshot,
        "task",
        taskId,
      );
      const hasStatus = hasOwn(movement, "status");
      const hasIndex = hasOwn(movement, "index");
      const hasProjectId = hasOwn(movement, "projectId");
      const hasIdeaId = hasOwn(movement, "ideaId");

      if (!hasStatus && !hasIndex && !hasProjectId && !hasIdeaId) {
        return currentSnapshot;
      }

      const nextProjectId = hasProjectId ? movement.projectId : existingTask.projectId;
      const nextIdeaId = hasIdeaId ? movement.ideaId : existingTask.ideaId;

      if (nextProjectId) {
        this.#getEntityContext(currentSnapshot, "project", nextProjectId);
      }

      if (nextIdeaId) {
        this.#getEntityContext(currentSnapshot, "idea", nextIdeaId);
      }

      const statusOrder = currentSnapshot.boards.tasks.statusOrder;
      const nextStatus = hasStatus ? movement.status : existingTask.status;
      const now = new Date().toISOString();
      const nextTask = this.#createUpdatedEntity(
        "task",
        existingTask,
        {
          status: nextStatus,
          projectId: nextProjectId,
          ideaId: nextIdeaId,
        },
        0,
        now,
      );
      const originalIndexes = new Map(
        currentSnapshot.tasks.map((entry, index) => [entry.id, index]),
      );
      const sortTasks = (left, right) => {
        const orderDelta = left.order - right.order;
        if (orderDelta !== 0) {
          return orderDelta;
        }

        return (originalIndexes.get(left.id) ?? 0) - (originalIndexes.get(right.id) ?? 0);
      };
      const currentIndex = [...currentSnapshot.tasks]
        .filter((entry) => entry.status === existingTask.status)
        .sort(sortTasks)
        .findIndex((entry) => entry.id === taskId);
      const nextBuckets = new Map(statusOrder.map((status) => [status, []]));
      currentSnapshot.tasks
        .filter((entry) => entry.id !== taskId)
        .sort((left, right) => {
          const leftStatusIndex = statusOrder.indexOf(left.status);
          const rightStatusIndex = statusOrder.indexOf(right.status);
          if (leftStatusIndex !== rightStatusIndex) {
            return leftStatusIndex - rightStatusIndex;
          }

          return sortTasks(left, right);
        })
        .forEach((entry) => {
          if (!nextBuckets.has(entry.status)) {
            nextBuckets.set(entry.status, []);
          }

          nextBuckets.get(entry.status).push(entry);
        });

      const targetBucket = nextBuckets.get(nextTask.status) ?? [];
      const nextIndex = hasIndex
        ? movement.index
        : nextTask.status === existingTask.status
          ? currentIndex
          : targetBucket.length;
      nextBuckets.set(nextTask.status, [
        ...insertAtIndex(targetBucket, nextTask, nextIndex),
      ]);

      return {
        ...currentSnapshot,
        tasks: [...nextBuckets.entries()].flatMap(([status, entries]) =>
          entries.map((entry, index) =>
            createEntityRecord(
              "task",
              {
                ...entry,
                status,
                order: index,
                updatedAt:
                  entry.id === nextTask.id || entry.order !== index || entry.status !== status
                    ? now
                    : entry.updatedAt,
              },
              {
                now,
                fallbackOrder: index,
              },
            ),
          ),
        ),
      };
    });
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

  moveIdea(ideaId, movement = {}) {
    return this.writeSnapshot((currentSnapshot) => {
      const { existingEntity: existingIdea } = this.#getEntityContext(
        currentSnapshot,
        "idea",
        ideaId,
      );
      const hasStage = hasOwn(movement, "stage");
      const hasIndex = hasOwn(movement, "index");

      if (!hasStage && !hasIndex) {
        return currentSnapshot;
      }

      const nextStage = hasStage ? movement.stage : existingIdea.stage;
      const now = new Date().toISOString();
      const nextIdea = this.#createUpdatedEntity(
        "idea",
        existingIdea,
        { stage: nextStage },
        0,
        now,
      );
      const currentIndex = currentSnapshot.ideas
        .filter((entry) => entry.stage === existingIdea.stage)
        .findIndex((entry) => entry.id === ideaId);
      const nextIndex = hasIndex
        ? movement.index
        : nextIdea.stage === existingIdea.stage
          ? currentIndex
          : currentSnapshot.ideas.filter((entry) => entry.stage === nextIdea.stage).length;

      return {
        ...currentSnapshot,
        ideas: moveCollectionEntryWithinGroups(
          currentSnapshot.ideas,
          ideaId,
          nextIdea,
          "stage",
          currentSnapshot.boards.ideas.stageOrder,
          nextIndex,
        ),
      };
    });
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

  moveFile(fileId, nextParentId = null, options = {}) {
    return this.writeSnapshot((currentSnapshot) => {
      const { existingCollection, existingIndex, existingEntity: existingFile } =
        this.#getEntityContext(currentSnapshot, "file", fileId);
      const hasIndex = hasOwn(options, "index");

      if (nextParentId === fileId) {
        throw new Error("A file cannot be its own parent.");
      }

      if (nextParentId) {
        this.#getEntityContext(currentSnapshot, "file", nextParentId);
      }

      if (!hasIndex && nextParentId === existingFile.parentId) {
        return currentSnapshot;
      }

      const descendantIds = collectDescendantFileIds(currentSnapshot.files, fileId);
      if (nextParentId && descendantIds.has(nextParentId)) {
        throw new Error("A file cannot move into one of its descendants.");
      }

      const nextChildIdsByFileId = new Map(
        currentSnapshot.files.map((file) => [file.id, [...file.childIds]]),
      );
      let nextRootFileIds = [...currentSnapshot.fileHierarchy.rootFileIds];
      const currentParentId = existingFile.parentId ?? null;

      if (currentParentId) {
        nextChildIdsByFileId.set(
          currentParentId,
          removeFromCollection(nextChildIdsByFileId.get(currentParentId) ?? [], fileId),
        );
      } else {
        nextRootFileIds = removeFromCollection(nextRootFileIds, fileId);
      }

      if (nextParentId) {
        nextChildIdsByFileId.set(
          nextParentId,
          insertAtIndex(nextChildIdsByFileId.get(nextParentId) ?? [], fileId, options.index),
        );
      } else {
        nextRootFileIds = insertAtIndex(nextRootFileIds, fileId, options.index);
      }

      const now = new Date().toISOString();
      const nextFile = this.#createUpdatedEntity(
        "file",
        existingFile,
        { parentId: nextParentId },
        existingIndex,
        now,
      );

      return {
        ...currentSnapshot,
        fileHierarchy: {
          ...currentSnapshot.fileHierarchy,
          rootFileIds: nextRootFileIds,
        },
        files: existingCollection.map((file, index) => {
          if (index === existingIndex) {
            return {
              ...nextFile,
              childIds: nextChildIdsByFileId.get(file.id) ?? nextFile.childIds,
            };
          }

          return {
            ...file,
            childIds: nextChildIdsByFileId.get(file.id) ?? file.childIds,
          };
        }),
      };
    });
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

  linkEntities(entityType, entityId, relatedEntityType, relatedEntityId) {
    return this.#updateEntityLink(
      entityType,
      entityId,
      relatedEntityType,
      relatedEntityId,
      true,
    );
  }

  unlinkEntities(entityType, entityId, relatedEntityType, relatedEntityId) {
    return this.#updateEntityLink(
      entityType,
      entityId,
      relatedEntityType,
      relatedEntityId,
      false,
    );
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

  #getEntityContext(currentSnapshot, entityType, entityId) {
    const collectionKey = getEntityCollectionKey(entityType);
    const existingCollection = currentSnapshot[collectionKey];
    const existingIndex = existingCollection.findIndex((entry) => entry.id === entityId);

    if (existingIndex < 0) {
      throw new Error(`Unknown ${entityType} id: ${entityId}`);
    }

    return {
      collectionKey,
      existingCollection,
      existingIndex,
      existingEntity: existingCollection[existingIndex],
    };
  }

  #createUpdatedEntity(entityType, existingEntity, updates, existingIndex, now) {
    return createEntityRecord(
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
  }

  #replaceEntityCollectionEntry(existingCollection, existingIndex, nextEntity) {
    return existingCollection.map((entry, index) =>
      index === existingIndex ? nextEntity : entry,
    );
  }

  #setEntityScalarRelation(
    currentSnapshot,
    entityType,
    entityId,
    relationKey,
    relatedEntityId,
    isLinked,
  ) {
    const {
      collectionKey,
      existingCollection,
      existingIndex,
      existingEntity,
    } = this.#getEntityContext(currentSnapshot, entityType, entityId);
    const currentValue = existingEntity[relationKey] ?? null;
    const nextValue = isLinked
      ? relatedEntityId
      : relatedEntityId == null || currentValue === relatedEntityId
        ? null
        : currentValue;

    if (currentValue === nextValue) {
      return currentSnapshot;
    }

    const now = new Date().toISOString();
    const nextEntity = this.#createUpdatedEntity(
      entityType,
      existingEntity,
      { [relationKey]: nextValue },
      existingIndex,
      now,
    );

    return {
      ...currentSnapshot,
      [collectionKey]: this.#replaceEntityCollectionEntry(
        existingCollection,
        existingIndex,
        nextEntity,
      ),
    };
  }

  #setEntityArrayRelation(
    currentSnapshot,
    entityType,
    entityId,
    relationKey,
    relatedEntityId,
    isLinked,
  ) {
    const {
      collectionKey,
      existingCollection,
      existingIndex,
      existingEntity,
    } = this.#getEntityContext(currentSnapshot, entityType, entityId);
    const currentIds = Array.isArray(existingEntity[relationKey])
      ? existingEntity[relationKey]
      : [];
    const nextIds = isLinked
      ? [...currentIds, relatedEntityId]
      : currentIds.filter((entryId) => entryId !== relatedEntityId);
    const normalizedIds = [...new Set(nextIds.filter(Boolean))];

    if (JSON.stringify(currentIds) === JSON.stringify(normalizedIds)) {
      return currentSnapshot;
    }

    const now = new Date().toISOString();
    const nextEntity = this.#createUpdatedEntity(
      entityType,
      existingEntity,
      { [relationKey]: normalizedIds },
      existingIndex,
      now,
    );

    return {
      ...currentSnapshot,
      [collectionKey]: this.#replaceEntityCollectionEntry(
        existingCollection,
        existingIndex,
        nextEntity,
      ),
    };
  }

  #updateEntityLink(
    entityType,
    entityId,
    relatedEntityType,
    relatedEntityId,
    isLinked,
  ) {
    return this.writeSnapshot((currentSnapshot) => {
      this.#getEntityContext(currentSnapshot, entityType, entityId);
      this.#getEntityContext(currentSnapshot, relatedEntityType, relatedEntityId);

      if (
        (entityType === "project" && relatedEntityType === "task") ||
        (entityType === "task" && relatedEntityType === "project")
      ) {
        const taskId = entityType === "task" ? entityId : relatedEntityId;
        const projectId = entityType === "project" ? entityId : relatedEntityId;

        return this.#setEntityScalarRelation(
          currentSnapshot,
          "task",
          taskId,
          "projectId",
          projectId,
          isLinked,
        );
      }

      if (
        (entityType === "task" && relatedEntityType === "idea") ||
        (entityType === "idea" && relatedEntityType === "task")
      ) {
        const taskId = entityType === "task" ? entityId : relatedEntityId;
        const ideaId = entityType === "idea" ? entityId : relatedEntityId;

        return this.#setEntityScalarRelation(
          currentSnapshot,
          "task",
          taskId,
          "ideaId",
          ideaId,
          isLinked,
        );
      }

      if (
        (entityType === "project" && relatedEntityType === "idea") ||
        (entityType === "idea" && relatedEntityType === "project")
      ) {
        const ideaId = entityType === "idea" ? entityId : relatedEntityId;
        const projectId = entityType === "project" ? entityId : relatedEntityId;
        const nextSnapshot = this.#setEntityArrayRelation(
          currentSnapshot,
          "idea",
          ideaId,
          "projectIds",
          projectId,
          isLinked,
        );

        return this.#setEntityArrayRelation(
          nextSnapshot,
          "project",
          projectId,
          "ideaIds",
          ideaId,
          isLinked,
        );
      }

      if (
        (entityType === "project" && relatedEntityType === "file") ||
        (entityType === "file" && relatedEntityType === "project")
      ) {
        const fileId = entityType === "file" ? entityId : relatedEntityId;
        const projectId = entityType === "project" ? entityId : relatedEntityId;
        const nextSnapshot = this.#setEntityArrayRelation(
          currentSnapshot,
          "file",
          fileId,
          "projectIds",
          projectId,
          isLinked,
        );

        return this.#setEntityArrayRelation(
          nextSnapshot,
          "project",
          projectId,
          "fileIds",
          fileId,
          isLinked,
        );
      }

      if (
        (entityType === "task" && relatedEntityType === "file") ||
        (entityType === "file" && relatedEntityType === "task")
      ) {
        const fileId = entityType === "file" ? entityId : relatedEntityId;
        const taskId = entityType === "task" ? entityId : relatedEntityId;
        const nextSnapshot = this.#setEntityArrayRelation(
          currentSnapshot,
          "file",
          fileId,
          "taskIds",
          taskId,
          isLinked,
        );

        return this.#setEntityArrayRelation(
          nextSnapshot,
          "task",
          taskId,
          "fileIds",
          fileId,
          isLinked,
        );
      }

      if (
        (entityType === "idea" && relatedEntityType === "file") ||
        (entityType === "file" && relatedEntityType === "idea")
      ) {
        const fileId = entityType === "file" ? entityId : relatedEntityId;
        const ideaId = entityType === "idea" ? entityId : relatedEntityId;
        const nextSnapshot = this.#setEntityArrayRelation(
          currentSnapshot,
          "file",
          fileId,
          "ideaIds",
          ideaId,
          isLinked,
        );

        return this.#setEntityArrayRelation(
          nextSnapshot,
          "idea",
          ideaId,
          "fileIds",
          fileId,
          isLinked,
        );
      }

      throw new Error(
        `Unsupported workspace link pair: ${entityType} <-> ${relatedEntityType}`,
      );
    });
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
      const {
        collectionKey,
        existingCollection,
        existingIndex,
        existingEntity,
      } = this.#getEntityContext(currentSnapshot, entityType, entityId);
      const now = new Date().toISOString();
      const nextEntity = this.#createUpdatedEntity(
        entityType,
        existingEntity,
        updates,
        existingIndex,
        now,
      );

      return {
        ...currentSnapshot,
        [collectionKey]: this.#replaceEntityCollectionEntry(
          existingCollection,
          existingIndex,
          nextEntity,
        ),
      };
    });
  }

  #deleteEntity(entityType, entityId) {
    return this.writeSnapshot((currentSnapshot) => {
      const { collectionKey, existingCollection } = this.#getEntityContext(
        currentSnapshot,
        entityType,
        entityId,
      );

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
