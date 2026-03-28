/**
 * WorkspaceSnapshot v3 stores all shared workspace records plus normalized
 * Jakal-flow integration state. Feature routes may own local UI helpers and
 * components, but all shared writes, relation updates, and external sync
 * results must pass through WorkspaceRepository methods and id-based contracts
 * only.
 */
export const WORKSPACE_STORAGE_KEY = "jakal.workspace.snapshot";
export const WORKSPACE_STORAGE_VERSION = 3;

export const WorkspaceRouteKeys = Object.freeze([
  "projects",
  "tasks",
  "ideas",
  "files",
]);

export const WorkspaceEntityTypes = Object.freeze([
  "project",
  "task",
  "idea",
  "file",
]);

export const ProjectStatusOrder = Object.freeze([
  "planned",
  "active",
  "paused",
  "done",
]);

export const TaskStatusOrder = Object.freeze([
  "backlog",
  "ready",
  "in_progress",
  "done",
]);

export const IdeaStageOrder = Object.freeze([
  "captured",
  "shaping",
  "validated",
  "promoted",
]);

export const FileKinds = Object.freeze(["folder", "document", "asset"]);

export const IntegrationProviders = Object.freeze(["jakal_flow", "github"]);

export const IntegrationConnectionStatusOrder = Object.freeze([
  "disconnected",
  "connecting",
  "connected",
  "error",
]);

export const IntegrationRecordStatusOrder = Object.freeze([
  "idle",
  "pending",
  "synced",
  "error",
]);

export const CrossLinkRefs = Object.freeze({
  projectId: "string | null",
  projectIds: "string[]",
  taskId: "string | null",
  taskIds: "string[]",
  ideaId: "string | null",
  ideaIds: "string[]",
  fileId: "string | null",
  fileIds: "string[]",
  parentId: "string | null",
  childIds: "string[]",
});

export const WorkspaceProject = Object.freeze({
  id: "string",
  slug: "string",
  title: "string",
  summary: "string",
  description: "string",
  status: ProjectStatusOrder.join(" | "),
  taskIds: CrossLinkRefs.taskIds,
  ideaIds: CrossLinkRefs.ideaIds,
  fileIds: CrossLinkRefs.fileIds,
  createdAt: "ISO-8601 string",
  updatedAt: "ISO-8601 string",
});

export const WorkspaceTask = Object.freeze({
  id: "string",
  projectId: CrossLinkRefs.projectId,
  ideaId: CrossLinkRefs.ideaId,
  title: "string",
  summary: "string",
  status: TaskStatusOrder.join(" | "),
  order: "number",
  fileIds: CrossLinkRefs.fileIds,
  createdAt: "ISO-8601 string",
  updatedAt: "ISO-8601 string",
});

export const WorkspaceIdea = Object.freeze({
  id: "string",
  title: "string",
  summary: "string",
  stage: IdeaStageOrder.join(" | "),
  projectIds: CrossLinkRefs.projectIds,
  taskIds: CrossLinkRefs.taskIds,
  fileIds: CrossLinkRefs.fileIds,
  promotedProjectId: CrossLinkRefs.projectId,
  createdAt: "ISO-8601 string",
  updatedAt: "ISO-8601 string",
});

export const WorkspaceFile = Object.freeze({
  id: "string",
  name: "string",
  summary: "string",
  kind: FileKinds.join(" | "),
  extension: "string",
  parentId: CrossLinkRefs.parentId,
  childIds: CrossLinkRefs.childIds,
  projectIds: CrossLinkRefs.projectIds,
  taskIds: CrossLinkRefs.taskIds,
  ideaIds: CrossLinkRefs.ideaIds,
  createdAt: "ISO-8601 string",
  updatedAt: "ISO-8601 string",
});

export const WorkspaceIntegrationRecord = Object.freeze({
  id: "string",
  provider: IntegrationProviders.join(" | "),
  entityType: WorkspaceEntityTypes.join(" | "),
  entityId: "string",
  externalId: "string",
  externalKey: "string",
  title: "string",
  url: "string",
  branch: "string",
  repository: "string",
  status: IntegrationRecordStatusOrder.join(" | "),
  syncedAt: "ISO-8601 string | null",
  updatedAt: "ISO-8601 string",
  metadata: "Record<string, unknown>",
});

export const WorkspaceJakalFlowIntegration = Object.freeze({
  connectionStatus: IntegrationConnectionStatusOrder.join(" | "),
  workspaceId: "string",
  workspaceSlug: "string",
  syncedAt: "ISO-8601 string | null",
  lastError: "string",
  records: "WorkspaceIntegrationRecord[]",
});

export const WorkspaceGitHubIntegration = Object.freeze({
  connectionStatus: IntegrationConnectionStatusOrder.join(" | "),
  installationId: "string",
  owner: "string",
  repository: "string",
  syncedAt: "ISO-8601 string | null",
  lastError: "string",
  records: "WorkspaceIntegrationRecord[]",
});

export const WorkspaceSnapshot = Object.freeze({
  meta: Object.freeze({
    schemaVersion: "number",
    seededAt: "ISO-8601 string",
    updatedAt: "ISO-8601 string",
  }),
  navigation: Object.freeze({
    lastRoute: WorkspaceRouteKeys.join(" | "),
  }),
  boards: Object.freeze({
    projects: Object.freeze({
      statusOrder: "WorkspaceProject.status[]",
    }),
    tasks: Object.freeze({
      statusOrder: "WorkspaceTask.status[]",
    }),
    ideas: Object.freeze({
      stageOrder: "WorkspaceIdea.stage[]",
    }),
  }),
  fileHierarchy: Object.freeze({
    rootFileIds: CrossLinkRefs.fileIds,
  }),
  integrations: Object.freeze({
    jakalFlow: "WorkspaceJakalFlowIntegration",
    github: "WorkspaceGitHubIntegration",
  }),
  projects: "WorkspaceProject[]",
  tasks: "WorkspaceTask[]",
  ideas: "WorkspaceIdea[]",
  files: "WorkspaceFile[]",
});

let entityCounter = 0;

function createEntityId(prefix) {
  entityCounter += 1;
  return `${prefix}-${Date.now()}-${entityCounter}`;
}

function normalizeText(value, fallback = "") {
  return typeof value === "string" ? value.trim() || fallback : fallback;
}

function normalizeOptionalId(value) {
  const normalizedValue = normalizeText(value);
  return normalizedValue || null;
}

function normalizeIdArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((entry) => normalizeText(entry)).filter(Boolean))];
}

function normalizeTimestamp(value, fallback) {
  return normalizeText(value, fallback);
}

function normalizeOptionalTimestamp(value) {
  return value ? normalizeTimestamp(value, null) : null;
}

function normalizeChoice(value, allowedValues, fallback) {
  const normalizedValue = normalizeText(value, fallback);
  return allowedValues.includes(normalizedValue) ? normalizedValue : fallback;
}

function normalizeOrder(value, fallback) {
  const normalizedValue = Number(value);
  return Number.isFinite(normalizedValue) ? normalizedValue : fallback;
}

function normalizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...value };
}

function toSlug(value) {
  return (
    normalizeText(value, "project")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

function normalizeRouteKey(value) {
  return WorkspaceRouteKeys.includes(value) ? value : WorkspaceRouteKeys[0];
}

function firstId(value) {
  return normalizeIdArray(value)[0] ?? null;
}

function pushUnique(collection, value) {
  if (value && !collection.includes(value)) {
    collection.push(value);
  }
}

function createWorkspaceBoards() {
  return {
    projects: {
      statusOrder: [...ProjectStatusOrder],
    },
    tasks: {
      statusOrder: [...TaskStatusOrder],
    },
    ideas: {
      stageOrder: [...IdeaStageOrder],
    },
  };
}

export function createWorkspaceProject(project = {}, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const title = normalizeText(project.title, "Untitled project");
  const createdAt = normalizeTimestamp(project.createdAt, now);

  return {
    id: normalizeText(project.id, createEntityId("project")),
    slug: normalizeText(project.slug, toSlug(title)),
    title,
    summary: normalizeText(project.summary),
    description: normalizeText(project.description, normalizeText(project.summary)),
    status: normalizeChoice(
      project.status,
      ProjectStatusOrder,
      ProjectStatusOrder[0],
    ),
    taskIds: normalizeIdArray(project.taskIds),
    ideaIds: normalizeIdArray(project.ideaIds),
    fileIds: normalizeIdArray(project.fileIds),
    createdAt,
    updatedAt: normalizeTimestamp(project.updatedAt, createdAt),
  };
}

export function createWorkspaceTask(task = {}, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const createdAt = normalizeTimestamp(task.createdAt, now);

  return {
    id: normalizeText(task.id, createEntityId("task")),
    projectId: normalizeOptionalId(task.projectId),
    ideaId: normalizeOptionalId(task.ideaId),
    title: normalizeText(task.title, "Untitled task"),
    summary: normalizeText(task.summary),
    status: normalizeChoice(task.status, TaskStatusOrder, TaskStatusOrder[0]),
    order: normalizeOrder(task.order, options.fallbackOrder ?? 0),
    fileIds: normalizeIdArray(task.fileIds),
    createdAt,
    updatedAt: normalizeTimestamp(task.updatedAt, createdAt),
  };
}

export function createWorkspaceIdea(idea = {}, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const createdAt = normalizeTimestamp(idea.createdAt, now);

  return {
    id: normalizeText(idea.id, createEntityId("idea")),
    title: normalizeText(idea.title, "Untitled idea"),
    summary: normalizeText(idea.summary),
    stage: normalizeChoice(idea.stage, IdeaStageOrder, IdeaStageOrder[0]),
    projectIds: normalizeIdArray(idea.projectIds),
    taskIds: normalizeIdArray(idea.taskIds),
    fileIds: normalizeIdArray(idea.fileIds),
    promotedProjectId: normalizeOptionalId(idea.promotedProjectId),
    createdAt,
    updatedAt: normalizeTimestamp(idea.updatedAt, createdAt),
  };
}

export function createWorkspaceFile(file = {}, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const createdAt = normalizeTimestamp(file.createdAt, now);
  const kind = normalizeChoice(file.kind, FileKinds, options.defaultKind ?? "document");
  const name = normalizeText(file.name, "untitled");

  return {
    id: normalizeText(file.id, createEntityId("file")),
    name,
    summary: normalizeText(file.summary),
    kind,
    extension:
      kind === "folder"
        ? ""
        : normalizeText(
            file.extension,
            name.includes(".") ? name.split(".").pop() : "",
          ),
    parentId: normalizeOptionalId(file.parentId),
    childIds: normalizeIdArray(file.childIds),
    projectIds: normalizeIdArray(file.projectIds),
    taskIds: normalizeIdArray(file.taskIds),
    ideaIds: normalizeIdArray(file.ideaIds),
    createdAt,
    updatedAt: normalizeTimestamp(file.updatedAt, createdAt),
  };
}

export function createWorkspaceIntegrationRecord(record = {}, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const provider = normalizeChoice(
    record.provider ?? options.provider,
    IntegrationProviders,
    options.provider ?? IntegrationProviders[0],
  );

  return {
    id: normalizeText(record.id, createEntityId(`${provider}-integration`)),
    provider,
    entityType: normalizeChoice(
      record.entityType ?? record.entity?.type,
      WorkspaceEntityTypes,
      "project",
    ),
    entityId: normalizeText(record.entityId ?? record.entity?.id ?? record.localId),
    externalId: normalizeText(record.externalId ?? record.remoteId),
    externalKey: normalizeText(
      record.externalKey ?? record.remoteKey,
      normalizeText(record.externalId ?? record.remoteId),
    ),
    title: normalizeText(record.title ?? record.name),
    url: normalizeText(record.url),
    branch: normalizeText(record.branch),
    repository: normalizeText(record.repository),
    status: normalizeChoice(
      record.status,
      IntegrationRecordStatusOrder,
      IntegrationRecordStatusOrder[0],
    ),
    syncedAt: normalizeOptionalTimestamp(record.syncedAt ?? record.lastSyncedAt),
    updatedAt: normalizeTimestamp(record.updatedAt, now),
    metadata: normalizeMetadata(record.metadata ?? record.payload),
  };
}

export function normalizeJakalFlowIntegrationState(input = {}, options = {}) {
  const now = options.now ?? new Date().toISOString();

  return {
    connectionStatus: normalizeChoice(
      input.connectionStatus ?? input.status,
      IntegrationConnectionStatusOrder,
      "disconnected",
    ),
    workspaceId: normalizeText(input.workspaceId ?? input.accountId),
    workspaceSlug: normalizeText(input.workspaceSlug ?? input.accountLabel),
    syncedAt: normalizeOptionalTimestamp(input.syncedAt ?? input.lastSyncedAt),
    lastError: normalizeText(input.lastError ?? input.errorMessage),
    records: Array.isArray(input.records)
      ? input.records.map((record) =>
          createWorkspaceIntegrationRecord(record, {
            now,
            provider: "jakal_flow",
          }),
        )
      : [],
  };
}

export function normalizeGitHubIntegrationState(input = {}, options = {}) {
  const now = options.now ?? new Date().toISOString();

  return {
    connectionStatus: normalizeChoice(
      input.connectionStatus ?? input.status,
      IntegrationConnectionStatusOrder,
      "disconnected",
    ),
    installationId: normalizeText(input.installationId ?? input.accountId),
    owner: normalizeText(input.owner),
    repository: normalizeText(input.repository),
    syncedAt: normalizeOptionalTimestamp(input.syncedAt ?? input.lastSyncedAt),
    lastError: normalizeText(input.lastError ?? input.errorMessage),
    records: Array.isArray(input.records)
      ? input.records.map((record) =>
          createWorkspaceIntegrationRecord(record, {
            now,
            provider: "github",
          }),
        )
      : [],
  };
}

function normalizeProject(project = {}, index, now) {
  return createWorkspaceProject(
    {
      ...project,
      taskIds: project.taskIds ?? project.links?.taskIds,
      ideaIds: project.ideaIds ?? project.links?.ideaIds,
      fileIds: project.fileIds ?? project.links?.fileIds,
      id: project.id ?? `project-${index + 1}`,
      description: project.description ?? project.summary,
    },
    { now },
  );
}

function normalizeTask(task = {}, index, now) {
  return createWorkspaceTask(
    {
      ...task,
      projectId: task.projectId ?? firstId(task.projectIds ?? task.links?.projectIds),
      ideaId: task.ideaId ?? firstId(task.ideaIds ?? task.links?.ideaIds),
      fileIds: task.fileIds ?? task.links?.fileIds,
      id: task.id ?? `task-${index + 1}`,
    },
    { now, fallbackOrder: index },
  );
}

function normalizeIdea(idea = {}, index, now) {
  return createWorkspaceIdea(
    {
      ...idea,
      projectIds: idea.projectIds ?? idea.links?.projectIds,
      taskIds: idea.taskIds ?? idea.links?.taskIds,
      fileIds: idea.fileIds ?? idea.links?.fileIds,
      promotedProjectId:
        idea.promotedProjectId ??
        firstId(idea.promotedProjectIds ?? idea.links?.promotedProjectIds),
      id: idea.id ?? `idea-${index + 1}`,
    },
    { now },
  );
}

function normalizeFile(file = {}, index, now) {
  return createWorkspaceFile(
    {
      ...file,
      name: file.name ?? file.title,
      projectIds: file.projectIds ?? file.links?.projectIds,
      taskIds: file.taskIds ?? file.links?.taskIds,
      ideaIds: file.ideaIds ?? file.links?.ideaIds,
      id: file.id ?? `file-${index + 1}`,
    },
    { now, defaultKind: "document" },
  );
}

function cloneEntityMaps(entities) {
  return {
    projects: new Map(
      entities.projects.map((project) => [
        project.id,
        {
          ...project,
          taskIds: [...project.taskIds],
          ideaIds: [...project.ideaIds],
          fileIds: [...project.fileIds],
        },
      ]),
    ),
    tasks: new Map(
      entities.tasks.map((task) => [
        task.id,
        {
          ...task,
          fileIds: [...task.fileIds],
        },
      ]),
    ),
    ideas: new Map(
      entities.ideas.map((idea) => [
        idea.id,
        {
          ...idea,
          projectIds: [...idea.projectIds],
          taskIds: [...idea.taskIds],
          fileIds: [...idea.fileIds],
        },
      ]),
    ),
    files: new Map(
      entities.files.map((file) => [
        file.id,
        {
          ...file,
          childIds: [...file.childIds],
          projectIds: [...file.projectIds],
          taskIds: [...file.taskIds],
          ideaIds: [...file.ideaIds],
        },
      ]),
    ),
  };
}

function finalizeFileHierarchy(files, rootFileIds) {
  const fileLookup = new Map(
    files.map((file) => [
      file.id,
      {
        ...file,
        childIds: [],
      },
    ]),
  );

  const parentClaims = new Map();
  files.forEach((file) => {
    file.childIds.forEach((childId) => {
      if (!parentClaims.has(childId)) {
        parentClaims.set(childId, []);
      }

      parentClaims.get(childId).push(file.id);
    });
  });

  fileLookup.forEach((file) => {
    const claimedParents = parentClaims.get(file.id) ?? [];
    const explicitParentId =
      file.parentId && file.parentId !== file.id && fileLookup.has(file.parentId)
        ? file.parentId
        : null;
    const fallbackParentId =
      explicitParentId ??
      claimedParents.find((parentId) => parentId !== file.id && fileLookup.has(parentId)) ??
      null;

    file.parentId = fallbackParentId;
  });

  function createsCycle(fileId, parentId) {
    const seen = new Set([fileId]);
    let currentParentId = parentId;

    while (currentParentId) {
      if (seen.has(currentParentId)) {
        return true;
      }

      seen.add(currentParentId);
      currentParentId = fileLookup.get(currentParentId)?.parentId ?? null;
    }

    return false;
  }

  fileLookup.forEach((file) => {
    if (file.parentId && createsCycle(file.id, file.parentId)) {
      file.parentId = null;
    }
  });

  fileLookup.forEach((file) => {
    if (!file.parentId) {
      return;
    }

    const parentFile = fileLookup.get(file.parentId);
    if (!parentFile) {
      file.parentId = null;
      return;
    }

    pushUnique(parentFile.childIds, file.id);
  });

  const normalizedFiles = [...fileLookup.values()].map((file) => ({
    ...file,
    childIds: normalizeIdArray(file.childIds),
  }));

  const normalizedFileLookup = new Map(
    normalizedFiles.map((file) => [file.id, file]),
  );
  const candidateRoots = normalizedFiles
    .filter((file) => !file.parentId)
    .map((file) => file.id);
  const explicitRoots = normalizeIdArray(rootFileIds).filter((id) => {
    const file = normalizedFileLookup.get(id);
    return file && !file.parentId;
  });
  const normalizedRootFileIds = [
    ...explicitRoots,
    ...candidateRoots.filter((id) => !explicitRoots.includes(id)),
  ];

  return {
    files: normalizedFiles,
    rootFileIds: normalizedRootFileIds,
  };
}

function reconcileWorkspaceRelations(snapshot) {
  const entityMaps = cloneEntityMaps(snapshot);
  const projectIds = new Set(entityMaps.projects.keys());
  const taskIds = new Set(entityMaps.tasks.keys());
  const ideaIds = new Set(entityMaps.ideas.keys());
  const fileIds = new Set(entityMaps.files.keys());

  entityMaps.projects.forEach((project) => {
    project.taskIds = project.taskIds.filter((taskId) => taskIds.has(taskId));
    project.ideaIds = project.ideaIds.filter((ideaId) => ideaIds.has(ideaId));
    project.fileIds = project.fileIds.filter((fileId) => fileIds.has(fileId));
  });

  entityMaps.tasks.forEach((task) => {
    task.projectId = projectIds.has(task.projectId) ? task.projectId : null;
    task.ideaId = ideaIds.has(task.ideaId) ? task.ideaId : null;
    task.fileIds = task.fileIds.filter((fileId) => fileIds.has(fileId));
  });

  entityMaps.ideas.forEach((idea) => {
    idea.projectIds = idea.projectIds.filter((projectId) => projectIds.has(projectId));
    idea.taskIds = idea.taskIds.filter((taskId) => taskIds.has(taskId));
    idea.fileIds = idea.fileIds.filter((fileId) => fileIds.has(fileId));
    idea.promotedProjectId = projectIds.has(idea.promotedProjectId)
      ? idea.promotedProjectId
      : null;
  });

  entityMaps.files.forEach((file) => {
    file.projectIds = file.projectIds.filter((projectId) => projectIds.has(projectId));
    file.taskIds = file.taskIds.filter((taskId) => taskIds.has(taskId));
    file.ideaIds = file.ideaIds.filter((ideaId) => ideaIds.has(ideaId));
    file.childIds = file.childIds.filter((childId) => fileIds.has(childId));
    file.parentId =
      file.parentId && file.parentId !== file.id && fileIds.has(file.parentId)
        ? file.parentId
        : null;
  });

  entityMaps.projects.forEach((project) => {
    project.taskIds.forEach((taskId) => {
      const task = entityMaps.tasks.get(taskId);
      if (task && !task.projectId) {
        task.projectId = project.id;
      }
    });

    project.ideaIds.forEach((ideaId) => {
      const idea = entityMaps.ideas.get(ideaId);
      if (idea) {
        pushUnique(idea.projectIds, project.id);
      }
    });

    project.fileIds.forEach((fileId) => {
      const file = entityMaps.files.get(fileId);
      if (file) {
        pushUnique(file.projectIds, project.id);
      }
    });
  });

  entityMaps.tasks.forEach((task) => {
    if (task.projectId) {
      const project = entityMaps.projects.get(task.projectId);
      if (project) {
        pushUnique(project.taskIds, task.id);
      }
    }

    if (task.ideaId) {
      const idea = entityMaps.ideas.get(task.ideaId);
      if (idea) {
        pushUnique(idea.taskIds, task.id);
      }
    }

    task.fileIds.forEach((fileId) => {
      const file = entityMaps.files.get(fileId);
      if (file) {
        pushUnique(file.taskIds, task.id);
      }
    });
  });

  entityMaps.ideas.forEach((idea) => {
    idea.projectIds.forEach((projectId) => {
      const project = entityMaps.projects.get(projectId);
      if (project) {
        pushUnique(project.ideaIds, idea.id);
      }
    });

    idea.taskIds.forEach((taskId) => {
      const task = entityMaps.tasks.get(taskId);
      if (task && !task.ideaId) {
        task.ideaId = idea.id;
      }
    });

    if (idea.promotedProjectId) {
      pushUnique(idea.projectIds, idea.promotedProjectId);
      const promotedProject = entityMaps.projects.get(idea.promotedProjectId);
      if (promotedProject) {
        pushUnique(promotedProject.ideaIds, idea.id);
      }
    }

    idea.fileIds.forEach((fileId) => {
      const file = entityMaps.files.get(fileId);
      if (file) {
        pushUnique(file.ideaIds, idea.id);
      }
    });
  });

  entityMaps.files.forEach((file) => {
    file.projectIds.forEach((projectId) => {
      const project = entityMaps.projects.get(projectId);
      if (project) {
        pushUnique(project.fileIds, file.id);
      }
    });

    file.taskIds.forEach((taskId) => {
      const task = entityMaps.tasks.get(taskId);
      if (task) {
        pushUnique(task.fileIds, file.id);
      }
    });

    file.ideaIds.forEach((ideaId) => {
      const idea = entityMaps.ideas.get(ideaId);
      if (idea) {
        pushUnique(idea.fileIds, file.id);
      }
    });
  });

  const projects = [...entityMaps.projects.values()].map((project) => ({
    ...project,
    taskIds: normalizeIdArray(
      project.taskIds.filter(
        (taskId) => entityMaps.tasks.get(taskId)?.projectId === project.id,
      ),
    ),
    ideaIds: normalizeIdArray(project.ideaIds),
    fileIds: normalizeIdArray(project.fileIds),
  }));
  const tasks = [...entityMaps.tasks.values()].map((task) => ({
    ...task,
    fileIds: normalizeIdArray(task.fileIds),
  }));
  const ideas = [...entityMaps.ideas.values()].map((idea) => ({
    ...idea,
    projectIds: normalizeIdArray(idea.projectIds),
    taskIds: normalizeIdArray(
      idea.taskIds.filter((taskId) => entityMaps.tasks.get(taskId)?.ideaId === idea.id),
    ),
    fileIds: normalizeIdArray(idea.fileIds),
  }));
  const fileHierarchy = finalizeFileHierarchy(
    [...entityMaps.files.values()].map((file) => ({
      ...file,
      projectIds: normalizeIdArray(file.projectIds),
      taskIds: normalizeIdArray(file.taskIds),
      ideaIds: normalizeIdArray(file.ideaIds),
      childIds: normalizeIdArray(file.childIds),
    })),
    snapshot.rootFileIds,
  );

  return {
    projects,
    tasks,
    ideas,
    files: fileHierarchy.files,
    rootFileIds: fileHierarchy.rootFileIds,
  };
}

function createEntityLookup(snapshot) {
  return {
    project: new Set(snapshot.projects.map((project) => project.id)),
    task: new Set(snapshot.tasks.map((task) => task.id)),
    idea: new Set(snapshot.ideas.map((idea) => idea.id)),
    file: new Set(snapshot.files.map((file) => file.id)),
  };
}

function finalizeIntegrationRecords(records, provider, entityLookup) {
  return records.filter(
    (record) =>
      record.provider === provider &&
      entityLookup[record.entityType]?.has(record.entityId),
  );
}

function finalizeIntegrations(snapshot, entityLookup, now) {
  const rawJakalFlow =
    snapshot.integrations?.jakalFlow ??
    snapshot.integrations?.jakal_flow ??
    snapshot.jakalFlow ??
    {};
  const rawGitHub =
    snapshot.integrations?.github ??
    snapshot.github ??
    {};
  const jakalFlow = normalizeJakalFlowIntegrationState(rawJakalFlow, { now });
  const github = normalizeGitHubIntegrationState(rawGitHub, { now });

  return {
    jakalFlow: {
      ...jakalFlow,
      records: finalizeIntegrationRecords(
        jakalFlow.records,
        "jakal_flow",
        entityLookup,
      ),
    },
    github: {
      ...github,
      records: finalizeIntegrationRecords(github.records, "github", entityLookup),
    },
  };
}

export function normalizeWorkspaceSnapshotV3(snapshot = {}) {
  const now = new Date().toISOString();
  const relations = reconcileWorkspaceRelations({
    projects: Array.isArray(snapshot.projects)
      ? snapshot.projects.map((project, index) => normalizeProject(project, index, now))
      : [],
    tasks: Array.isArray(snapshot.tasks)
      ? snapshot.tasks.map((task, index) => normalizeTask(task, index, now))
      : [],
    ideas: Array.isArray(snapshot.ideas)
      ? snapshot.ideas.map((idea, index) => normalizeIdea(idea, index, now))
      : [],
    files: Array.isArray(snapshot.files)
      ? snapshot.files.map((file, index) => normalizeFile(file, index, now))
      : [],
    rootFileIds: snapshot.fileHierarchy?.rootFileIds ?? snapshot.rootFileIds,
  });
  const seededAt = normalizeTimestamp(snapshot.meta?.seededAt, now);
  const updatedAt = normalizeTimestamp(snapshot.meta?.updatedAt, seededAt);
  const integrations = finalizeIntegrations(
    snapshot,
    createEntityLookup(relations),
    now,
  );

  return {
    meta: {
      schemaVersion: WORKSPACE_STORAGE_VERSION,
      seededAt,
      updatedAt,
    },
    navigation: {
      lastRoute: normalizeRouteKey(snapshot.navigation?.lastRoute),
    },
    boards: createWorkspaceBoards(),
    fileHierarchy: {
      rootFileIds: relations.rootFileIds,
    },
    integrations,
    projects: relations.projects,
    tasks: relations.tasks,
    ideas: relations.ideas,
    files: relations.files,
  };
}

export const normalizeWorkspaceSnapshotV2 = normalizeWorkspaceSnapshotV3;

export function createSeedWorkspaceSnapshot() {
  const now = new Date().toISOString();
  const rootFolderId = "file-shell-root";
  const guideFileId = "file-shell-guide";

  return {
    meta: {
      schemaVersion: WORKSPACE_STORAGE_VERSION,
      seededAt: now,
      updatedAt: now,
    },
    navigation: {
      lastRoute: "projects",
    },
    boards: createWorkspaceBoards(),
    fileHierarchy: {
      rootFileIds: [rootFolderId],
    },
    integrations: {
      jakalFlow: {
        connectionStatus: "connected",
        workspaceId: "jakal-flow-shell",
        workspaceSlug: "workspace-shell",
        syncedAt: now,
        lastError: "",
        records: [
          createWorkspaceIntegrationRecord(
            {
              id: "jakal-flow-project-shell",
              provider: "jakal_flow",
              entityType: "project",
              entityId: "project-shell",
              externalId: "workspace-shell-project",
              externalKey: "JKL-SHELL-1",
              title: "Workspace shell",
              url: "https://github.com/Ahnd6474/Jakal-flow",
              status: "synced",
              metadata: {
                lane: "active",
              },
            },
            { now, provider: "jakal_flow" },
          ),
          createWorkspaceIntegrationRecord(
            {
              id: "jakal-flow-task-shell",
              provider: "jakal_flow",
              entityType: "task",
              entityId: "task-shell",
              externalId: "workspace-shell-task",
              externalKey: "JKL-SHELL-2",
              title: "Freeze workspace contracts",
              url: "https://github.com/Ahnd6474/Jakal-flow",
              status: "pending",
              metadata: {
                board: "execution",
              },
            },
            { now, provider: "jakal_flow" },
          ),
        ],
      },
      github: {
        connectionStatus: "connected",
        installationId: "github-shell-installation",
        owner: "Ahnd6474",
        repository: "experiment",
        syncedAt: now,
        lastError: "",
        records: [
          createWorkspaceIntegrationRecord(
            {
              id: "github-project-shell",
              provider: "github",
              entityType: "project",
              entityId: "project-shell",
              externalId: "Ahnd6474/experiment",
              externalKey: "Ahnd6474/experiment",
              title: "experiment",
              url: "https://github.com/Ahnd6474/experiment",
              repository: "Ahnd6474/experiment",
              branch: "main",
              status: "synced",
            },
            { now, provider: "github" },
          ),
          createWorkspaceIntegrationRecord(
            {
              id: "github-file-shell-guide",
              provider: "github",
              entityType: "file",
              entityId: guideFileId,
              externalId: "workspace-overview-md",
              externalKey: "workspace-overview.md",
              title: "workspace-overview.md",
              url: "https://github.com/Ahnd6474/experiment",
              repository: "Ahnd6474/experiment",
              branch: "main",
              status: "synced",
            },
            { now, provider: "github" },
          ),
        ],
      },
    },
    projects: [
      createWorkspaceProject(
        {
          id: "project-shell",
          slug: "workspace-shell",
          title: "Workspace shell",
          summary: "Stable desktop shell and route contracts for downstream slices.",
          description:
            "Route modules fan out from the shell while shared records stay frozen in WorkspaceSnapshot v3.",
          status: "active",
          taskIds: ["task-shell"],
          ideaIds: ["idea-shell"],
          fileIds: [rootFolderId, guideFileId],
        },
        { now },
      ),
    ],
    tasks: [
      createWorkspaceTask(
        {
          id: "task-shell",
          projectId: "project-shell",
          ideaId: "idea-shell",
          title: "Freeze repository boundary",
          summary: "All shared writes and sync state are routed through WorkspaceRepository.",
          status: "in_progress",
          order: 0,
          fileIds: [guideFileId],
        },
        { now },
      ),
    ],
    ideas: [
      createWorkspaceIdea(
        {
          id: "idea-shell",
          title: "Feature slice backlog",
          summary:
            "Parallel features plug into the shell without redefining snapshot shape.",
          stage: "shaping",
          projectIds: ["project-shell"],
          taskIds: ["task-shell"],
          fileIds: [guideFileId],
        },
        { now },
      ),
    ],
    files: [
      createWorkspaceFile(
        {
          id: rootFolderId,
          name: "workspace",
          summary: "Top-level file hierarchy root for the seeded shell.",
          kind: "folder",
          childIds: [guideFileId],
          projectIds: ["project-shell"],
        },
        { now, defaultKind: "folder" },
      ),
      createWorkspaceFile(
        {
          id: guideFileId,
          name: "workspace-overview.md",
          summary:
            "Shared contracts and route structure are frozen before feature work lands.",
          kind: "document",
          extension: "md",
          parentId: rootFolderId,
          projectIds: ["project-shell"],
          taskIds: ["task-shell"],
          ideaIds: ["idea-shell"],
        },
        { now, defaultKind: "document" },
      ),
    ],
  };
}
