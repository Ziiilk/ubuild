$ErrorActionPreference = "Stop"

$repositoryRoot = $PSScriptRoot
$hookPath = Join-Path $repositoryRoot ".githooks\commit-msg"

if (-not (Test-Path -LiteralPath $hookPath -PathType Leaf)) {
    throw "Git hook not found: $hookPath"
}

git -C $repositoryRoot rev-parse --is-inside-work-tree | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Not a Git repository: $repositoryRoot"
}

git -C $repositoryRoot config --local core.hooksPath .githooks
if ($LASTEXITCODE -ne 0) {
    throw "Failed to configure core.hooksPath"
}

Write-Host "Git hooks enabled for this clone."
