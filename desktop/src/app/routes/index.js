/**
 * Jakal Workspace is a local-first desktop shell. All feature slices read shared
 * data from WorkspaceSnapshot and perform writes only through WorkspaceRepository.
 * Top-level routes are projects, tasks, ideas, and files. Feature modules own
 * their UI and feature-local helpers, but shared entities may only reference each
 * other by ids through CrossLinkRefs.
 */
export const AppShellRoutes = Object.freeze([
  Object.freeze({
    key: "projects",
    label: "Projects",
    description: "Project hub",
    path: "#/projects",
  }),
  Object.freeze({
    key: "tasks",
    label: "Tasks",
    description: "Task board",
    path: "#/tasks",
  }),
  Object.freeze({
    key: "ideas",
    label: "Ideas",
    description: "Idea board",
    path: "#/ideas",
  }),
  Object.freeze({
    key: "files",
    label: "Files",
    description: "File organizer",
    path: "#/files",
  }),
]);

export const DEFAULT_APP_ROUTE = AppShellRoutes[0].key;

export function routeFromHash(hashValue) {
  const normalizedHash = (hashValue || "").replace(/^#\/?/, "");
  const matchedRoute = AppShellRoutes.find(
    (route) => route.key === normalizedHash,
  );

  return matchedRoute ? matchedRoute.key : DEFAULT_APP_ROUTE;
}
