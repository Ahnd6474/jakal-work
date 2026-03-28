/**
 * Jakal Workspace is a local-first desktop shell. All feature slices read shared
 * data from WorkspaceSnapshot and perform writes only through WorkspaceRepository.
 * Top-level routes are projects, tasks, ideas, and files. Feature modules own
 * their UI and feature-local helpers, but shared entities may only reference each
 * other by ids through CrossLinkRefs.
 */
export const WORKSPACE_STORAGE_KEY = "jakal.workspace.snapshot";
export const WORKSPACE_STORAGE_VERSION = 1;

export const CrossLinkRefs = Object.freeze({
  projectIds: "string[]",
  taskIds: "string[]",
  ideaIds: "string[]",
  fileIds: "string[]",
});

export const WorkspaceSnapshot = Object.freeze({
  meta: Object.freeze({
    schemaVersion: "number",
    seededAt: "ISO-8601 string",
    updatedAt: "ISO-8601 string",
  }),
  navigation: Object.freeze({
    lastRoute: "projects | tasks | ideas | files",
  }),
  projects: "WorkspaceProject[]",
  tasks: "WorkspaceTask[]",
  ideas: "WorkspaceIdea[]",
  files: "WorkspaceFile[]",
});

function baseSeedRecord(id, title, summary, links) {
  return {
    id,
    title,
    summary,
    links,
  };
}

export function createSeedWorkspaceSnapshot() {
  const now = new Date().toISOString();

  return {
    meta: {
      schemaVersion: WORKSPACE_STORAGE_VERSION,
      seededAt: now,
      updatedAt: now,
    },
    navigation: {
      lastRoute: "projects",
    },
    projects: [
      baseSeedRecord(
        "project-shell",
        "Workspace shell",
        "Stable desktop shell and route contracts for downstream slices.",
        {
          taskIds: ["task-shell"],
          ideaIds: ["idea-shell"],
          fileIds: ["file-shell"],
        },
      ),
    ],
    tasks: [
      baseSeedRecord(
        "task-shell",
        "Freeze repository boundary",
        "All UI writes are routed through WorkspaceRepository.",
        {
          projectIds: ["project-shell"],
          ideaIds: [],
          fileIds: [],
        },
      ),
    ],
    ideas: [
      baseSeedRecord(
        "idea-shell",
        "Feature slice backlog",
        "Parallel features plug into the shell without redefining snapshot shape.",
        {
          projectIds: ["project-shell"],
          taskIds: ["task-shell"],
          fileIds: [],
        },
      ),
    ],
    files: [
      baseSeedRecord(
        "file-shell",
        "workspace-overview.md",
        "Shared contracts and route structure are frozen before feature work lands.",
        {
          projectIds: ["project-shell"],
          taskIds: [],
          ideaIds: ["idea-shell"],
        },
      ),
    ],
  };
}
