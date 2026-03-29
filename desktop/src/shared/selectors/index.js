const IntegrationDescriptors = Object.freeze([
  Object.freeze({
    key: "jakalFlow",
    provider: "jakal_flow",
    label: "Jakal Flow",
  }),
  Object.freeze({
    key: "github",
    provider: "github",
    label: "GitHub",
  }),
]);

function createEntityMap(collection = []) {
  return new Map(collection.map((entry) => [entry.id, entry]));
}

function selectByIds(ids = [], entityMap) {
  return ids.map((id) => entityMap.get(id)).filter(Boolean);
}

function buildIntegrationIndex(snapshot) {
  const recordsByEntityKey = new Map();

  IntegrationDescriptors.forEach(({ key }) => {
    const records = snapshot.integrations?.[key]?.records ?? [];

    records.forEach((record) => {
      const entityKey = `${record.entityType}:${record.entityId}`;
      if (!recordsByEntityKey.has(entityKey)) {
        recordsByEntityKey.set(entityKey, []);
      }

      recordsByEntityKey.get(entityKey).push(record);
    });
  });

  return recordsByEntityKey;
}

function summarizeIntegrationRecords(records = []) {
  const statusCounts = records.reduce((summary, record) => {
    summary[record.status] = (summary[record.status] ?? 0) + 1;
    return summary;
  }, {});
  const providerKeys = [...new Set(records.map((record) => record.provider))];
  const syncedAt = records
    .map((record) => record.syncedAt)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
  let status = "idle";

  if (records.some((record) => record.status === "error")) {
    status = "error";
  } else if (records.some((record) => record.status === "pending")) {
    status = "pending";
  } else if (records.some((record) => record.status === "synced")) {
    status = "synced";
  } else if (records.length > 0) {
    status = records[0].status;
  }

  return {
    status,
    recordCount: records.length,
    providerKeys,
    syncedAt,
    statusCounts,
  };
}

function buildFilePath(file, filesById) {
  const path = [];
  const visited = new Set();
  let currentFile = file;

  while (currentFile && !visited.has(currentFile.id)) {
    path.unshift(currentFile);
    visited.add(currentFile.id);
    currentFile = currentFile.parentId ? filesById.get(currentFile.parentId) ?? null : null;
  }

  return path;
}

function buildWorkspaceContext(snapshot) {
  return {
    snapshot,
    projectsById: createEntityMap(snapshot.projects ?? []),
    tasksById: createEntityMap(snapshot.tasks ?? []),
    ideasById: createEntityMap(snapshot.ideas ?? []),
    filesById: createEntityMap(snapshot.files ?? []),
    integrationIndex: buildIntegrationIndex(snapshot),
  };
}

function createEntityDetail(entityType, entity, context) {
  const entityKey = `${entityType}:${entity.id}`;
  const integrationRecords = context.integrationIndex.get(entityKey) ?? [];
  const integration = summarizeIntegrationRecords(integrationRecords);

  if (entityType === "project") {
    return {
      entityType,
      entity,
      related: {
        projects: [],
        tasks: selectByIds(entity.taskIds, context.tasksById),
        ideas: selectByIds(entity.ideaIds, context.ideasById),
        files: selectByIds(entity.fileIds, context.filesById),
      },
      integration,
      integrationRecords,
    };
  }

  if (entityType === "task") {
    return {
      entityType,
      entity,
      related: {
        projects: entity.projectId
          ? selectByIds([entity.projectId], context.projectsById)
          : [],
        tasks: [],
        ideas: entity.ideaId ? selectByIds([entity.ideaId], context.ideasById) : [],
        files: selectByIds(entity.fileIds, context.filesById),
      },
      integration,
      integrationRecords,
    };
  }

  if (entityType === "idea") {
    const promotedProject = entity.promotedProjectId
      ? context.projectsById.get(entity.promotedProjectId) ?? null
      : null;

    return {
      entityType,
      entity,
      related: {
        projects: selectByIds(entity.projectIds, context.projectsById),
        tasks: selectByIds(entity.taskIds, context.tasksById),
        ideas: [],
        files: selectByIds(entity.fileIds, context.filesById),
        promotedProject,
      },
      integration,
      integrationRecords,
    };
  }

  if (entityType === "file") {
    const parent = entity.parentId ? context.filesById.get(entity.parentId) ?? null : null;

    return {
      entityType,
      entity,
      related: {
        projects: selectByIds(entity.projectIds, context.projectsById),
        tasks: selectByIds(entity.taskIds, context.tasksById),
        ideas: selectByIds(entity.ideaIds, context.ideasById),
        files: [],
        parent,
        children: selectByIds(entity.childIds, context.filesById),
        path: buildFilePath(entity, context.filesById),
      },
      integration,
      integrationRecords,
    };
  }

  return null;
}

function createBoardGroups(order, items, groupKey) {
  return order.map((value) => {
    const groupedItems = items.filter((item) => item.entity[groupKey] === value);

    return {
      key: value,
      count: groupedItems.length,
      items: groupedItems,
    };
  });
}

function createFileNode(file, context, trail = new Set()) {
  const nextTrail = new Set(trail);
  nextTrail.add(file.id);
  const detail = createEntityDetail("file", file, context);

  return {
    ...detail,
    children: detail.related.children
      .filter((child) => !nextTrail.has(child.id))
      .map((child) => createFileNode(child, context, nextTrail)),
  };
}

export function selectWorkspaceDetail(snapshot, entityType, entityId) {
  const context = buildWorkspaceContext(snapshot);
  const entityMap =
    entityType === "project"
      ? context.projectsById
      : entityType === "task"
        ? context.tasksById
        : entityType === "idea"
          ? context.ideasById
          : entityType === "file"
            ? context.filesById
            : null;

  if (!entityMap) {
    return null;
  }

  const entity = entityMap.get(entityId);
  return entity ? createEntityDetail(entityType, entity, context) : null;
}

export function selectProjectBoard(snapshot) {
  const context = buildWorkspaceContext(snapshot);
  const items = (snapshot.projects ?? []).map((project) =>
    createEntityDetail("project", project, context),
  );

  return {
    statusOrder: snapshot.boards?.projects?.statusOrder ?? [],
    groups: createBoardGroups(snapshot.boards?.projects?.statusOrder ?? [], items, "status"),
  };
}

export function selectTaskBoard(snapshot) {
  const context = buildWorkspaceContext(snapshot);
  const items = [...(snapshot.tasks ?? [])]
    .sort((left, right) => left.order - right.order)
    .map((task) => createEntityDetail("task", task, context));

  return {
    statusOrder: snapshot.boards?.tasks?.statusOrder ?? [],
    groups: createBoardGroups(snapshot.boards?.tasks?.statusOrder ?? [], items, "status"),
  };
}

export function selectIdeaBoard(snapshot) {
  const context = buildWorkspaceContext(snapshot);
  const items = (snapshot.ideas ?? []).map((idea) =>
    createEntityDetail("idea", idea, context),
  );

  return {
    stageOrder: snapshot.boards?.ideas?.stageOrder ?? [],
    groups: createBoardGroups(snapshot.boards?.ideas?.stageOrder ?? [], items, "stage"),
  };
}

export function selectFileTree(snapshot, parentId = null) {
  const context = buildWorkspaceContext(snapshot);
  const fileIds = parentId
    ? context.filesById.get(parentId)?.childIds ?? []
    : snapshot.fileHierarchy?.rootFileIds ?? [];

  return {
    parentId,
    roots: fileIds
      .map((fileId) => context.filesById.get(fileId))
      .filter(Boolean)
      .map((file) => createFileNode(file, context)),
  };
}

export function selectIntegrationOverview(snapshot) {
  return {
    providers: IntegrationDescriptors.map(({ key, provider, label }) => {
      const integrationState = snapshot.integrations?.[key] ?? {};
      const records = integrationState.records ?? [];
      const countsByEntity = records.reduce((summary, record) => {
        summary[record.entityType] = (summary[record.entityType] ?? 0) + 1;
        return summary;
      }, {});

      return {
        key,
        provider,
        label,
        connectionStatus: integrationState.connectionStatus ?? "disconnected",
        lastError: integrationState.lastError ?? "",
        syncedAt: integrationState.syncedAt ?? null,
        recordCount: records.length,
        countsByEntity,
      };
    }),
  };
}
