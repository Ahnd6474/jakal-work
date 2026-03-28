<#
.SYNOPSIS
Managed Jakal-flow test workspace contract: keep the upstream checkout under `workspace/jakal-flow`, keep generated logs and summaries under `artifacts/`, expose stable entrypoints `bootstrap`, `test-backend`, `test-desktop`, and `test-all`, and report stage results through one shared schema without mutating upstream source files except dependency installs inside the managed checkout.
#>

Set-StrictMode -Version Latest

function Get-TestWorkspaceRepoRoot {
    param(
        [string]$RepoRoot
    )

    if ($RepoRoot) {
        return (Resolve-Path -LiteralPath $RepoRoot).Path
    }

    return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
}

function Get-TestWorkspaceContract {
    param(
        [string]$RepoRoot
    )

    $resolvedRepoRoot = Get-TestWorkspaceRepoRoot -RepoRoot $RepoRoot
    $configPath = Join-Path $resolvedRepoRoot "config/jakal-flow-target.json"

    if (-not (Test-Path -LiteralPath $configPath)) {
        throw "Workspace contract config not found at '$configPath'."
    }

    return Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
}

function Resolve-TestWorkspacePaths {
    param(
        [object]$Contract,
        [string]$RepoRoot
    )

    $resolvedRepoRoot = Get-TestWorkspaceRepoRoot -RepoRoot $RepoRoot

    if (-not $Contract) {
        $Contract = Get-TestWorkspaceContract -RepoRoot $resolvedRepoRoot
    }

    [pscustomobject]@{
        RepoRoot            = $resolvedRepoRoot
        ConfigPath          = Join-Path $resolvedRepoRoot "config/jakal-flow-target.json"
        WorkspaceRoot       = Join-Path $resolvedRepoRoot $Contract.workspace.root
        ManagedCheckoutRoot = Join-Path $resolvedRepoRoot $Contract.workspace.managedCheckoutRoot
        ArtifactsRoot       = Join-Path $resolvedRepoRoot $Contract.artifacts.root
        StageResultsRoot    = Join-Path $resolvedRepoRoot $Contract.artifacts.stageResultsRoot
        LogsRoot            = Join-Path $resolvedRepoRoot $Contract.artifacts.logsRoot
        ResultFileName      = $Contract.results.resultFileName
    }
}

function New-TestStageResult {
    param(
        [Parameter(Mandatory = $true)]
        [ValidatePattern("^[A-Za-z0-9._-]+$")]
        [string]$Stage,

        [Parameter(Mandatory = $true)]
        [string]$Status,

        [string]$Summary = "",

        [hashtable]$Details = @{},

        [string]$ResultPath,

        [string]$StartedAt = ([DateTimeOffset]::UtcNow.ToString("o")),

        [string]$FinishedAt = ([DateTimeOffset]::UtcNow.ToString("o")),

        [int]$SchemaVersion = 1
    )

    return [ordered]@{
        schemaVersion = $SchemaVersion
        stage         = $Stage
        status        = $Status
        summary       = $Summary
        startedAt     = $StartedAt
        finishedAt    = $FinishedAt
        resultPath    = $ResultPath
        details       = [pscustomobject]$Details
    }
}

function Write-TestStageResult {
    param(
        [Parameter(Mandatory = $true)]
        [ValidatePattern("^[A-Za-z0-9._-]+$")]
        [string]$Stage,

        [Parameter(Mandatory = $true)]
        [string]$Status,

        [string]$Summary = "",

        [hashtable]$Details = @{},

        [string]$RepoRoot
    )

    $contract = Get-TestWorkspaceContract -RepoRoot $RepoRoot
    $paths = Resolve-TestWorkspacePaths -Contract $contract -RepoRoot $RepoRoot
    $stageDirectory = Join-Path $paths.StageResultsRoot $Stage
    $resultPath = Join-Path $stageDirectory $paths.ResultFileName

    New-Item -ItemType Directory -Path $stageDirectory -Force | Out-Null

    $result = New-TestStageResult `
        -Stage $Stage `
        -Status $Status `
        -Summary $Summary `
        -Details $Details `
        -ResultPath $resultPath `
        -SchemaVersion $contract.results.schemaVersion

    [System.IO.File]::WriteAllText(
        $resultPath,
        ($result | ConvertTo-Json -Depth 10),
        (New-Object System.Text.UTF8Encoding($false))
    )

    return [pscustomobject]$result
}
