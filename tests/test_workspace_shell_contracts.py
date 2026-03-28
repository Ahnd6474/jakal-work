import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def read_text(relative_path: str) -> str:
    return (REPO_ROOT / relative_path).read_text(encoding="utf-8")


def test_desktop_package_freezes_react_entrypoint_metadata():
    package_json = json.loads(read_text("desktop/package.json"))

    assert package_json["name"] == "jakal-workspace-desktop"
    assert package_json["type"] == "module"
    assert package_json["dependencies"]["react"] == "18.2.0"
    assert package_json["dependencies"]["react-dom"] == "18.2.0"


def test_routes_contract_exposes_the_four_stable_shell_surfaces():
    routes_source = read_text("desktop/src/app/routes/index.js")

    assert 'key: "projects"' in routes_source
    assert 'key: "tasks"' in routes_source
    assert 'key: "ideas"' in routes_source
    assert 'key: "files"' in routes_source
    assert "export const AppShellRoutes" in routes_source
    assert "routeFromHash" in routes_source


def test_snapshot_contract_freezes_cross_link_refs_and_seed_data():
    contracts_source = read_text("desktop/src/shared/contracts/index.js")

    assert "export const CrossLinkRefs" in contracts_source
    assert "export const WorkspaceSnapshot" in contracts_source
    assert "createSeedWorkspaceSnapshot" in contracts_source
    assert '"project-shell"' in contracts_source
    assert '"task-shell"' in contracts_source
    assert '"idea-shell"' in contracts_source
    assert '"file-shell"' in contracts_source


def test_repository_adapter_is_seed_backed_and_migration_ready():
    storage_source = read_text("desktop/src/shared/storage/workspaceRepository.js")

    assert "export class WorkspaceRepository" in storage_source
    assert "migrations = []" in storage_source
    assert "readSnapshot()" in storage_source
    assert "writeSnapshot(updater)" in storage_source
    assert "replaceSnapshot(snapshot)" in storage_source
    assert "#migrateSnapshot" in storage_source
    assert "createSeedWorkspaceSnapshot" in storage_source


def test_app_shell_mounts_routes_against_a_single_repository_boundary():
    app_source = read_text("desktop/src/App.jsx")
    main_source = read_text("desktop/src/main.jsx")

    assert "<App repository={workspaceRepository} />" in main_source
    assert "AppShellRoutes.map" in app_source
    assert "WorkspaceRepository" in app_source
    assert 'href={route.path}' in app_source
    assert "repository.writeSnapshot" in app_source


def test_tauri_entrypoint_exists_for_the_desktop_shell():
    tauri_source = read_text("src-tauri/src/main.rs")

    assert "tauri::Builder::default()" in tauri_source
    assert "generate_context!" in tauri_source
