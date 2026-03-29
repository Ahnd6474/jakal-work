import json
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def read_text(relative_path: str) -> str:
    return (REPO_ROOT / relative_path).read_text(encoding="utf-8")


def assert_contains(source: str, *expected_fragments: str) -> None:
    for fragment in expected_fragments:
        assert fragment in source


def run_node(script: str) -> str:
    completed = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def test_desktop_package_freezes_react_entrypoint_metadata():
    package_json = json.loads(read_text("desktop/package.json"))

    assert package_json["name"] == "jakal-workspace-desktop"
    assert package_json["type"] == "module"
    assert package_json["devDependencies"]["vite"] == "8.0.3"
    assert package_json["dependencies"]["react"] == "18.2.0"
    assert package_json["dependencies"]["react-dom"] == "18.2.0"


def test_routes_contract_exposes_the_four_stable_shell_surfaces():
    routes_source = read_text("desktop/src/app/routes/index.js")

    assert_contains(
        routes_source,
        'key: "projects"',
        'key: "tasks"',
        'key: "ideas"',
        'key: "files"',
        "export const AppShellRoutes",
        "routeFromHash",
    )


def test_snapshot_contract_freezes_v3_entities_integrations_and_hierarchy():
    contracts_source = read_text("desktop/src/shared/contracts/index.js")

    assert_contains(
        contracts_source,
        "WORKSPACE_STORAGE_VERSION = 3",
        "WorkspaceSnapshot v3 stores all shared workspace records",
        "export const WorkspaceProject",
        "export const WorkspaceTask",
        "export const WorkspaceIdea",
        "export const WorkspaceFile",
        "export const WorkspaceIntegrationRecord",
        "export const WorkspaceJakalFlowIntegration",
        "export const WorkspaceGitHubIntegration",
        "integrations:",
        "normalizeWorkspaceSnapshotV3",
        "normalizeWorkspaceSnapshotV2 = normalizeWorkspaceSnapshotV3",
        '"jakal-flow-project-shell"',
        '"github-project-shell"',
    )


def test_repository_adapter_exposes_v3_write_boundary_and_integration_adapter():
    storage_source = read_text("desktop/src/shared/storage/workspaceRepository.js")
    storage_index_source = read_text("desktop/src/shared/storage/index.js")
    selectors_source = read_text("desktop/src/shared/selectors/index.js")

    assert_contains(
        storage_source,
        "export class WorkspaceRepository",
        "defaultWorkspaceMigrations",
        "normalizeWorkspaceSnapshotV3",
        "moveProject(projectId, movement = {})",
        "createTask(taskInput = {})",
        "moveTask(taskId, movement = {})",
        "createIdea(ideaInput = {})",
        "moveIdea(ideaId, movement = {})",
        "createFile(fileInput = {})",
        "moveFile(fileId, nextParentId = null, options = {})",
        "linkEntities(entityType, entityId, relatedEntityType, relatedEntityId)",
        "unlinkEntities(entityType, entityId, relatedEntityType, relatedEntityId)",
        "replaceJakalFlowIntegration(integrationInput = {})",
        "replaceGitHubIntegration(integrationInput = {})",
        "upsertIntegrationRecord(providerKey, recordInput = {})",
        "export class WorkspaceIntegrationAdapter",
        "createWorkspaceIntegrationAdapter(repository)",
    )
    assert_contains(
        storage_index_source,
        "WorkspaceIntegrationAdapter",
        "createWorkspaceIntegrationAdapter",
    )
    assert_contains(
        selectors_source,
        "export function selectWorkspaceDetail",
        "export function selectProjectBoard",
        "export function selectTaskBoard",
        "export function selectIdeaBoard",
        "export function selectFileTree",
        "export function selectIntegrationOverview",
    )


def test_app_shell_only_selects_route_entries_and_repository_boundary():
    app_source = read_text("desktop/src/App.jsx")
    main_source = read_text("desktop/src/main.jsx")

    assert_contains(
        main_source,
        "<App repository={workspaceRepository} />",
    )
    assert_contains(
        app_source,
        'import ProjectsRoute from "./features/projects/ProjectsRoute.jsx";',
        'import TasksRoute from "./features/tasks/TasksRoute.jsx";',
        'import IdeasRoute from "./features/ideas/IdeasRoute.jsx";',
        'import FilesRoute from "./features/files/FilesRoute.jsx";',
        "const routeEntries = Object.freeze({",
        "repository.updateNavigation(activeRoute)",
        "<ActiveRouteEntry repository={repository} snapshot={snapshot} />",
    )
    assert "activeRecords.map" not in app_source
    assert "repository.writeSnapshot" not in app_source


def test_surface_route_entry_modules_exist_with_frozen_contract_docstring():
    for relative_path in (
        "desktop/src/features/projects/ProjectsRoute.jsx",
        "desktop/src/features/tasks/TasksRoute.jsx",
        "desktop/src/features/ideas/IdeasRoute.jsx",
        "desktop/src/features/files/FilesRoute.jsx",
    ):
        source = read_text(relative_path)

        assert_contains(
            source,
            "AppShell owns only route selection, shell chrome, and shared repository wiring.",
            "Shared data lives in WorkspaceSnapshot v2",
            "export default function",
        )


def test_repository_runtime_persists_v3_snapshot_and_selector_safe_mutations():
    result = run_node(
        """
        import {
          createWorkspaceIntegrationAdapter,
          createWorkspaceRepository,
        } from "./desktop/src/shared/storage/index.js";
        import {
          selectFileTree,
          selectIdeaBoard,
          selectIntegrationOverview,
          selectProjectBoard,
          selectTaskBoard,
          selectWorkspaceDetail,
        } from "./desktop/src/shared/selectors/index.js";

        const storage = {
          cache: new Map(),
          getItem(key) { return this.cache.has(key) ? this.cache.get(key) : null; },
          setItem(key, value) { this.cache.set(key, value); },
          removeItem(key) { this.cache.delete(key); },
        };

        const repository = createWorkspaceRepository({ storage });
        const adapter = createWorkspaceIntegrationAdapter(repository);
        const seeded = repository.readSnapshot();
        const createdProjectSnapshot = repository.createProject({
          title: "Client hub",
          summary: "Cross-route mutation verification.",
        });
        const createdProject = createdProjectSnapshot.projects.at(-1);
        const movedProjectSnapshot = repository.moveProject(createdProject.id, {
          status: "active",
          index: 0,
        });
        const movedProject = movedProjectSnapshot.projects.find(
          (project) => project.id === createdProject.id,
        );
        const createdTaskSnapshot = repository.createTask({
          title: "Wire delivery",
          summary: "Cross-route task move verification.",
        });
        const createdTask = createdTaskSnapshot.tasks.at(-1);
        const linkedTaskSnapshot = repository.linkEntities(
          "project",
          createdProject.id,
          "task",
          createdTask.id,
        );
        const movedTaskSnapshot = repository.moveTask(createdTask.id, {
          status: "in_progress",
          index: 0,
        });
        const createdIdeaSnapshot = repository.createIdea({
          title: "Ops launch",
          summary: "Promotion candidate.",
        });
        const createdIdea = createdIdeaSnapshot.ideas.at(-1);
        repository.linkEntities("idea", createdIdea.id, "project", createdProject.id);
        repository.linkEntities("task", createdTask.id, "idea", createdIdea.id);
        const movedIdeaSnapshot = repository.moveIdea(createdIdea.id, {
          stage: "validated",
          index: 0,
        });
        const promotedSnapshot = repository.promoteIdeaToProject(createdIdea.id, {
          title: "Ops launch project",
          summary: "Created from idea promotion.",
        });
        const promotedIdea = promotedSnapshot.ideas.find((idea) => idea.id === createdIdea.id);
        const promotedProject = promotedSnapshot.projects.find(
          (project) => project.id === promotedIdea.promotedProjectId,
        );
        const createdFolderSnapshot = repository.createFile({
          name: "briefs",
          kind: "folder",
        });
        const createdFolder = createdFolderSnapshot.files.at(-1);
        repository.moveFile(createdFolder.id, "file-shell-root", { index: 0 });
        const createdFileSnapshot = repository.createFile({
          name: "launch.md",
          parentId: createdFolder.id,
        });
        const createdFile = createdFileSnapshot.files.at(-1);
        repository.linkEntities("file", createdFile.id, "project", createdProject.id);
        repository.linkEntities("file", createdFile.id, "task", createdTask.id);
        repository.linkEntities("file", createdFile.id, "idea", promotedIdea.id);
        const unlinkedFileSnapshot = repository.unlinkEntities(
          "file",
          createdFile.id,
          "idea",
          promotedIdea.id,
        );
        repository.linkEntities("file", createdFile.id, "idea", promotedIdea.id);
        let cycleError = "";
        try {
          repository.moveFile(createdFolder.id, createdFile.id);
        } catch (error) {
          cycleError = error.message;
        }
        const movedFileSnapshot = repository.moveFile(createdFile.id, "file-shell-root", {
          index: 0,
        });
        adapter.applyJakalFlowSync({
          connectionStatus: "connected",
          workspaceId: "wk-1",
          workspaceSlug: "ops-shell",
          records: [
            {
              id: "valid-task-sync",
              entityType: "task",
              entityId: createdTask.id,
              externalId: "task-22",
              externalKey: "TASK-22",
              title: "Task 22",
              status: "synced",
            },
            {
              id: "valid-idea-sync",
              entityType: "idea",
              entityId: createdIdea.id,
              externalId: "idea-14",
              externalKey: "IDEA-14",
              title: "Idea 14",
              status: "pending",
              metadata: {
                lane: "validation",
              },
            },
            {
              id: "invalid-sync",
              entityType: "project",
              entityId: "missing-project",
              externalId: "project-missing",
            },
          ],
        });
        adapter.applyGitHubSync({
          connectionStatus: "connected",
          installationId: "gh-1",
          owner: "Ahnd6474",
          repository: "experiment",
          records: [
            {
              id: "github-project-hub",
              entityType: "project",
              entityId: createdProject.id,
              externalId: "repo-1",
              externalKey: "Ahnd6474/experiment#client-hub",
              title: "Client hub",
              repository: "Ahnd6474/experiment",
              branch: "main",
              status: "synced",
              metadata: {
                panel: "delivery",
              },
            },
            {
              id: "github-file-launch",
              entityType: "file",
              entityId: createdFile.id,
              externalId: "launch-md",
              externalKey: "launch.md",
              title: "launch.md",
              repository: "Ahnd6474/experiment",
              branch: "main",
              status: "pending",
            },
          ],
        });
        const selectorSnapshot = repository.upsertIntegrationRecord("github", {
          id: "github-project-hub",
          entityType: "project",
          entityId: createdProject.id,
          externalId: "repo-1",
          externalKey: "Ahnd6474/experiment#client-hub",
          title: "Client hub",
          repository: "Ahnd6474/experiment",
          branch: "main",
          status: "synced",
          metadata: {
            panel: "hub",
          },
        });
        const projectBoard = selectProjectBoard(selectorSnapshot);
        const taskBoard = selectTaskBoard(selectorSnapshot);
        const ideaBoard = selectIdeaBoard(selectorSnapshot);
        const rootFolderTree = selectFileTree(selectorSnapshot, "file-shell-root");
        const projectDetail = selectWorkspaceDetail(
          selectorSnapshot,
          "project",
          createdProject.id,
        );
        const taskDetail = selectWorkspaceDetail(selectorSnapshot, "task", createdTask.id);
        const ideaDetail = selectWorkspaceDetail(selectorSnapshot, "idea", createdIdea.id);
        const fileDetail = selectWorkspaceDetail(selectorSnapshot, "file", createdFile.id);
        const integrationOverview = selectIntegrationOverview(selectorSnapshot);
        const afterDeleteProject = repository.deleteProject(createdProject.id);
        const deletedTask = afterDeleteProject.tasks.find((task) => task.id === createdTask.id);
        const deletedFile = afterDeleteProject.files.find((file) => file.id === createdFile.id);
        const activeProjects = projectBoard.groups.find((group) => group.key === "active");
        const inProgressTasks = taskBoard.groups.find((group) => group.key === "in_progress");
        const promotedIdeas = ideaBoard.groups.find((group) => group.key === "promoted");

        console.log(JSON.stringify({
          seededSchemaVersion: seeded.meta.schemaVersion,
          seededJakalFlowRecords: seeded.integrations.jakalFlow.records.length,
          seededGitHubRecords: seeded.integrations.github.records.length,
          seededRootFileIds: seeded.fileHierarchy.rootFileIds,
          movedProjectStatus: movedProject.status,
          activeProjectIds: activeProjects.items.map((item) => item.entity.id),
          linkedProjectTaskIds: linkedTaskSnapshot.projects.find((project) => project.id === createdProject.id).taskIds,
          movedTaskStatus: movedTaskSnapshot.tasks.find((task) => task.id === createdTask.id).status,
          inProgressTaskIds: inProgressTasks.items.map((item) => item.entity.id),
          inProgressTaskOrders: inProgressTasks.items.map((item) => item.entity.order),
          validatedIdeaStage: movedIdeaSnapshot.ideas.find((idea) => idea.id === createdIdea.id).stage,
          promotedIdeaId: promotedIdea.id,
          promotedIdeaStage: promotedIdea.stage,
          promotedIdeaProjectId: promotedIdea.promotedProjectId,
          promotedProjectIdeaIds: promotedProject.ideaIds,
          promotedIdeaIds: promotedIdeas.items.map((item) => item.entity.id),
          unlinkedFileIdeaIds: unlinkedFileSnapshot.files.find((file) => file.id === createdFile.id).ideaIds,
          movedFileParentId: movedFileSnapshot.files.find((file) => file.id === createdFile.id).parentId,
          rootFolderChildIds: rootFolderTree.roots.map((node) => node.entity.id),
          cycleError,
          jakalFlowRecordIds: selectorSnapshot.integrations.jakalFlow.records.map((record) => record.id),
          githubRecordIds: selectorSnapshot.integrations.github.records.map((record) => record.id),
          projectDetailTaskIds: projectDetail.related.tasks.map((task) => task.id),
          projectDetailIdeaIds: projectDetail.related.ideas.map((idea) => idea.id),
          projectDetailFileIds: projectDetail.related.files.map((file) => file.id),
          projectSyncStatus: projectDetail.integration.status,
          projectIntegrationPanel: projectDetail.integrationRecords[0].metadata.panel,
          taskDetailProjectId: taskDetail.related.projects[0].id,
          taskSyncStatus: taskDetail.integration.status,
          ideaSyncStatus: ideaDetail.integration.status,
          ideaPromotedProjectId: ideaDetail.related.promotedProject.id,
          fileSyncStatus: fileDetail.integration.status,
          filePathIds: fileDetail.related.path.map((file) => file.id),
          fileIdeaIds: fileDetail.related.ideas.map((idea) => idea.id),
          integrationOverview: integrationOverview.providers.map((provider) => ({
            key: provider.key,
            status: provider.connectionStatus,
            recordCount: provider.recordCount,
            countsByEntity: provider.countsByEntity,
          })),
          deletedTaskProjectId: deletedTask.projectId,
          deletedFileProjectIds: deletedFile.projectIds,
          storedSchemaVersion: JSON.parse(storage.getItem("jakal.workspace.snapshot")).meta.schemaVersion,
        }));
        """
    )
    payload = json.loads(result)

    assert payload["seededSchemaVersion"] == 3
    assert payload["seededJakalFlowRecords"] == 2
    assert payload["seededGitHubRecords"] == 2
    assert payload["seededRootFileIds"] == ["file-shell-root"]
    assert payload["movedProjectStatus"] == "active"
    assert payload["activeProjectIds"][0]
    assert payload["movedTaskStatus"] == "in_progress"
    assert payload["inProgressTaskOrders"] == list(range(len(payload["inProgressTaskIds"])))
    assert payload["validatedIdeaStage"] == "validated"
    assert payload["movedFileParentId"] == "file-shell-root"
    assert payload["cycleError"] == "A file cannot move into one of its descendants."
    assert payload["jakalFlowRecordIds"] == ["valid-task-sync", "valid-idea-sync"]
    assert payload["githubRecordIds"] == ["github-project-hub", "github-file-launch"]
    assert payload["deletedTaskProjectId"] is None
    assert payload["deletedFileProjectIds"] == []
    assert payload["storedSchemaVersion"] == 3
    assert payload["linkedProjectTaskIds"] == [payload["inProgressTaskIds"][0]]
    assert payload["promotedIdeaStage"] == "promoted"
    assert payload["promotedIdeaProjectId"]
    assert payload["promotedProjectIdeaIds"] == [payload["promotedIdeaId"]]
    assert payload["promotedIdeaIds"] == [payload["promotedIdeaId"]]
    assert payload["unlinkedFileIdeaIds"] == []
    assert payload["projectDetailTaskIds"] == [payload["inProgressTaskIds"][0]]
    assert payload["projectDetailIdeaIds"] == [payload["promotedIdeaId"]]
    assert len(payload["projectDetailFileIds"]) == 1
    assert payload["projectSyncStatus"] == "synced"
    assert payload["projectIntegrationPanel"] == "hub"
    assert payload["taskSyncStatus"] == "synced"
    assert payload["ideaSyncStatus"] == "pending"
    assert payload["taskDetailProjectId"] == payload["activeProjectIds"][0]
    assert payload["ideaPromotedProjectId"] == payload["promotedIdeaProjectId"]
    assert payload["fileSyncStatus"] == "pending"
    assert payload["fileIdeaIds"] == [payload["promotedIdeaId"]]
    assert payload["filePathIds"][0] == "file-shell-root"
    assert payload["filePathIds"][-1] in payload["rootFolderChildIds"]
    assert payload["rootFolderChildIds"][0] == payload["filePathIds"][-1]
    assert "file-shell-guide" in payload["rootFolderChildIds"]
    assert payload["integrationOverview"] == [
        {
            "key": "jakalFlow",
            "status": "connected",
            "recordCount": 2,
            "countsByEntity": {"task": 1, "idea": 1},
        },
        {
            "key": "github",
            "status": "connected",
            "recordCount": 2,
            "countsByEntity": {"project": 1, "file": 1},
        },
    ]


def test_repository_migrates_legacy_snapshot_to_v3_shape():
    result = run_node(
        """
        import { createWorkspaceRepository } from "./desktop/src/shared/storage/workspaceRepository.js";

        const storage = {
          cache: new Map([
            ["jakal.workspace.snapshot", JSON.stringify({
              meta: {
                schemaVersion: 1,
                seededAt: "2026-03-28T00:00:00.000Z",
                updatedAt: "2026-03-28T00:00:00.000Z",
              },
              navigation: {
                lastRoute: "tasks",
              },
              jakalFlow: {
                status: "connected",
                workspaceId: "legacy-wk",
                workspaceSlug: "legacy",
                records: [
                  {
                    id: "legacy-project-sync",
                    entityType: "project",
                    entityId: "project-legacy",
                    externalId: "legacy-1",
                    externalKey: "JKL-1",
                    title: "Legacy project",
                    status: "synced",
                  },
                ],
              },
              projects: [
                {
                  id: "project-legacy",
                  title: "Legacy project",
                  summary: "Migrated from v1.",
                  links: {
                    taskIds: ["task-legacy"],
                    ideaIds: ["idea-legacy"],
                    fileIds: ["file-legacy"],
                  },
                },
              ],
              tasks: [
                {
                  id: "task-legacy",
                  title: "Legacy task",
                  summary: "Migrated from v1.",
                  links: {
                    projectIds: ["project-legacy"],
                    ideaIds: ["idea-legacy"],
                    fileIds: ["file-legacy"],
                  },
                },
              ],
              ideas: [
                {
                  id: "idea-legacy",
                  title: "Legacy idea",
                  summary: "Migrated from v1.",
                  links: {
                    projectIds: ["project-legacy"],
                    taskIds: ["task-legacy"],
                    fileIds: ["file-legacy"],
                  },
                },
              ],
              files: [
                {
                  id: "file-legacy",
                  title: "legacy.md",
                  summary: "Migrated from v1.",
                  links: {
                    projectIds: ["project-legacy"],
                    taskIds: ["task-legacy"],
                    ideaIds: ["idea-legacy"],
                  },
                },
              ],
            })],
          ]),
          getItem(key) { return this.cache.has(key) ? this.cache.get(key) : null; },
          setItem(key, value) { this.cache.set(key, value); },
          removeItem(key) { this.cache.delete(key); },
        };

        const repository = createWorkspaceRepository({ storage });
        const snapshot = repository.readSnapshot();

        console.log(JSON.stringify({
          schemaVersion: snapshot.meta.schemaVersion,
          route: snapshot.navigation.lastRoute,
          projectStatus: snapshot.projects[0].status,
          projectTaskIds: snapshot.projects[0].taskIds,
          taskProjectId: snapshot.tasks[0].projectId,
          ideaStage: snapshot.ideas[0].stage,
          fileName: snapshot.files[0].name,
          rootFileIds: snapshot.fileHierarchy.rootFileIds,
          jakalFlowStatus: snapshot.integrations.jakalFlow.connectionStatus,
          jakalFlowRecordIds: snapshot.integrations.jakalFlow.records.map((record) => record.id),
          githubStatus: snapshot.integrations.github.connectionStatus,
        }));
        """
    )
    payload = json.loads(result)

    assert payload == {
        "schemaVersion": 3,
        "route": "tasks",
        "projectStatus": "planned",
        "projectTaskIds": ["task-legacy"],
        "taskProjectId": "project-legacy",
        "ideaStage": "captured",
        "fileName": "legacy.md",
        "rootFileIds": ["file-legacy"],
        "jakalFlowStatus": "connected",
        "jakalFlowRecordIds": ["legacy-project-sync"],
        "githubStatus": "disconnected",
    }


def test_routes_and_html_entrypoint_match_the_shell_contract():
    result = run_node(
        """
        import { AppShellRoutes, routeFromHash } from "./desktop/src/app/routes/index.js";

        console.log(JSON.stringify({
          routeKeys: AppShellRoutes.map((route) => route.key),
          filesHash: routeFromHash("#/files"),
          fallbackHash: routeFromHash("#/missing"),
        }));
        """
    )
    payload = json.loads(result)
    index_html = read_text("desktop/index.html")

    assert payload == {
        "routeKeys": ["projects", "tasks", "ideas", "files"],
        "filesHash": "files",
        "fallbackHash": "projects",
    }
    assert '<div id="root"></div>' in index_html
    assert 'src="/src/main.jsx"' in index_html
