param([string[]]$TestArgs = @('-q'))
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$runtimeRoot = Join-Path $repoRoot '.test-runtime/disposable'
$node = (Get-Command node).Source
$npmCli = Join-Path (Split-Path $node) 'node_modules/npm/bin/npm-cli.js'
if (!(Test-Path -LiteralPath $npmCli)) { throw 'Use a Node installation containing npm.' }

# Never load .env or print CLI status: it contains LOCAL test credentials.
Push-Location $runtimeRoot
try {
    $statusText = & $node $npmCli exec --yes --package=supabase@2.117.0 -- supabase status --workdir $runtimeRoot --output json
    if ($LASTEXITCODE -ne 0) { throw 'Local Supabase is not running.' }
} finally { Pop-Location }
$status = ($statusText -join "`n") | ConvertFrom-Json
if ($status.API_URL -ne 'http://127.0.0.1:55321') { throw 'Unexpected test API address.' }

# Verify runtime identity and isolation, not merely a localhost URL.
$network = (& docker network inspect stockerai-disposable-local | ConvertFrom-Json)[0]
if ($network.Labels.'stockerai.scope' -ne 'disposable') {
    throw 'Unexpected test network identity.'
}
$containers = & docker ps --filter label=com.supabase.cli.project=stockerai-disposable --format '{{.Names}}'
if (!$containers -or $LASTEXITCODE -ne 0) { throw 'No StockerAI disposable containers found.' }
foreach ($container in $containers) {
    $instance = (& docker inspect $container | ConvertFrom-Json)[0]
    if (@($instance.NetworkSettings.Networks.PSObject.Properties.Name).Count -ne 1 -or
        !$instance.NetworkSettings.Networks.'stockerai-disposable-local') { throw 'Unexpected container network.' }
    foreach ($port in $instance.NetworkSettings.Ports.PSObject.Properties.Value) {
        foreach ($binding in $port) {
            if ($binding -and $binding.HostIp -notin @('127.0.0.1', '::1')) { throw 'A test port is exposed beyond loopback.' }
        }
    }
}

$env:STOCKERAI_DB_TESTS = '1'
$env:STOCKERAI_TEST_SUPABASE_URL = $status.API_URL
$env:STOCKERAI_TEST_SERVICE_KEY = $status.SERVICE_ROLE_KEY
$env:OPENAI_API_KEY = ''
Push-Location (Join-Path $repoRoot 'python-api')
try {
    & (Join-Path $repoRoot '.test-runtime/Scripts/python.exe') -m pytest @TestArgs
    $resultCode = $LASTEXITCODE
} finally {
    Pop-Location
    Remove-Item Env:STOCKERAI_TEST_SERVICE_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:STOCKERAI_DB_TESTS -ErrorAction SilentlyContinue
    Remove-Item Env:STOCKERAI_TEST_SUPABASE_URL -ErrorAction SilentlyContinue
}
exit $resultCode
