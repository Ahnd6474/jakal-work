import json
import shutil
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = REPO_ROOT / "config" / "jakal-flow-target.json"
SCRIPT_PATH = REPO_ROOT / "scripts" / "lib" / "TestWorkspace.ps1"
GITIGNORE_PATH = REPO_ROOT / ".gitignore"


def run_powershell(script: str) -> str:
    errors = []
    for command in ("pwsh", "powershell"):
        try:
            completed = subprocess.run(
                [command, "-NoProfile", "-Command", script],
                check=True,
                capture_output=True,
                text=True,
                cwd=REPO_ROOT,
            )
            return completed.stdout.strip()
        except FileNotFoundError as exc:
            errors.append(exc)
        except subprocess.CalledProcessError as exc:
            raise AssertionError(exc.stderr.strip() or exc.stdout.strip()) from exc
    raise AssertionError(f"PowerShell executable not available: {errors}")


def quote_path(path: Path) -> str:
    return str(path).replace("'", "''")


def test_contract_config_and_gitignore_freeze_workspace_surface():
    contract = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    gitignore_lines = GITIGNORE_PATH.read_text(encoding="utf-8").splitlines()

    assert contract["contractVersion"] == 1
    assert contract["workspace"]["managedCheckoutRoot"] == "workspace/jakal-flow"
    assert contract["artifacts"]["root"] == "artifacts"
    assert contract["artifacts"]["stageResultsRoot"] == "artifacts/stages"
    assert contract["results"]["resultFileName"] == "result.json"
    assert contract["entrypoints"] == {
        "bootstrap": "scripts/bootstrap.ps1",
        "test-backend": "scripts/test-backend.ps1",
        "test-desktop": "scripts/test-desktop.ps1",
        "test-all": "scripts/test-all.ps1",
    }
    assert "/workspace/" in gitignore_lines
    assert "/artifacts/" in gitignore_lines


def test_powershell_helper_resolves_paths_and_writes_shared_stage_result(tmp_path: Path):
    temp_repo = tmp_path / "repo"
    temp_config_dir = temp_repo / "config"
    temp_config_dir.mkdir(parents=True)
    shutil.copy2(CONFIG_PATH, temp_config_dir / CONFIG_PATH.name)

    script = f"""
    $ErrorActionPreference = 'Stop'
    . '{quote_path(SCRIPT_PATH)}'
    $paths = Resolve-TestWorkspacePaths -RepoRoot '{quote_path(temp_repo)}'
    $result = Write-TestStageResult -Stage 'bootstrap' -Status 'passed' -Summary 'smoke test' -Details @{{ source = 'pytest' }} -RepoRoot '{quote_path(temp_repo)}'
    [pscustomobject]@{{
        managedCheckoutRoot = $paths.ManagedCheckoutRoot
        stageResultsRoot = $paths.StageResultsRoot
        result = $result
    }} | ConvertTo-Json -Depth 10 -Compress
    """

    payload = json.loads(run_powershell(script))
    expected_stage_results_root = temp_repo / "artifacts" / "stages"
    expected_result_path = expected_stage_results_root / "bootstrap" / "result.json"

    assert Path(payload["managedCheckoutRoot"]) == temp_repo / "workspace" / "jakal-flow"
    assert Path(payload["stageResultsRoot"]) == expected_stage_results_root
    assert Path(payload["result"]["resultPath"]) == expected_result_path
    assert payload["result"]["schemaVersion"] == 1
    assert payload["result"]["stage"] == "bootstrap"
    assert payload["result"]["status"] == "passed"
    assert payload["result"]["details"]["source"] == "pytest"
    assert json.loads(expected_result_path.read_text(encoding="utf-8"))["summary"] == "smoke test"
