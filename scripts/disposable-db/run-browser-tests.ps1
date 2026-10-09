param([string[]]$PlaywrightArgs = @())

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$runtimeRoot = Join-Path $repoRoot '.test-runtime/disposable'
$node = (Get-Command node).Source
$npmCli = Join-Path (Split-Path $node) 'node_modules/npm/bin/npm-cli.js'
if (!(Test-Path -LiteralPath $npmCli)) { throw 'Use a Node installation containing npm.' }

# Obtain only local credentials without printing them.
Push-Location $runtimeRoot
try {
    $statusText = & $node $npmCli exec --yes --package=supabase@2.117.0 -- supabase status --workdir $runtimeRoot --output json
    if ($LASTEXITCODE -ne 0) { throw 'Local Supabase is not running.' }
} finally { Pop-Location }
$status = ($statusText -join "`n") | ConvertFrom-Json
if ($status.API_URL -ne 'http://127.0.0.1:55321') { throw 'Unexpected disposable API address.' }
$marker = & docker exec supabase_db_stockerai-disposable psql -U postgres -d postgres -Atc 'SELECT public.stockerai_disposable_marker()'
if ($LASTEXITCODE -ne 0 -or $marker -ne 'stockerai-local-only-20260918') {
    throw 'Disposable database marker check failed.'
}

$userId = [guid]::NewGuid().ToString()
$email = "browser-$($userId.Substring(0, 8))@example.invalid"
$password = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(36))
$headers = @{
    apikey = $status.SERVICE_ROLE_KEY
    Authorization = "Bearer $($status.SERVICE_ROLE_KEY)"
    'Content-Type' = 'application/json'
}
$accountId = $null
$apiProcess = $null
$resultCode = 1

try {
    $body = @{
        id = $userId
        email = $email
        password = $password
        email_confirm = $true
        user_metadata = @{
            stocker_account_signup = $true
            driver_count = 2
            first_name = 'Browser'
            last_name = 'Fixture'
        }
    } | ConvertTo-Json -Depth 5
    $null = Invoke-RestMethod -Method Post -Uri "$($status.API_URL)/auth/v1/admin/users" -Headers $headers -Body $body

    $memberships = Invoke-RestMethod -Method Get -Uri "$($status.API_URL)/rest/v1/account_users?user_id=eq.$userId&select=account_id" -Headers $headers
    if (@($memberships).Count -ne 1) { throw 'Disposable browser user did not receive exactly one company.' }
    $accountId = @($memberships)[0].account_id

    # Browser scenarios are about picking and authentication, not checkout. Give only this
    # throwaway company explicit complimentary access so the billing gate cannot mask them.
    $activation = @{
        is_platform_account = $true
        subscription_status = 'active'
        billing_onboarding_required = $false
        driver_count = 2
    } | ConvertTo-Json
    $null = Invoke-RestMethod -Method Patch -Uri "$($status.API_URL)/rest/v1/accounts?id=eq.$accountId" -Headers ($headers + @{ Prefer = 'return=minimal' }) -Body $activation

    $env:STOCKERAI_DB_TESTS = '1'
    $env:STOCKERAI_TEST_SUPABASE_URL = $status.API_URL
    $env:STOCKERAI_TEST_SERVICE_KEY = $status.SERVICE_ROLE_KEY
    $env:STOCKERAI_TEST_ANON_KEY = $status.ANON_KEY
    $env:STOCKER_TEST_API = 'http://127.0.0.1:8099'
    $env:STOCKERAI_TEST_USER_ID = $userId
    $env:STOCKERAI_TEST_EMAIL = $email
    $env:SUPABASE_URL = $status.API_URL
    $env:SUPABASE_SERVICE_KEY = $status.SERVICE_ROLE_KEY
    $env:OPENAI_API_KEY = ''

    $apiOut = Join-Path $repoRoot '.test-runtime/browser-api.stdout.log'
    $apiErr = Join-Path $repoRoot '.test-runtime/browser-api.stderr.log'
    $python = Join-Path $repoRoot '.test-runtime/Scripts/python.exe'
    $apiProcess = Start-Process -FilePath $python `
        -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8099') `
        -WorkingDirectory (Join-Path $repoRoot 'python-api') -WindowStyle Hidden `
        -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr -PassThru

    $healthy = $false
    foreach ($attempt in 1..30) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8099/health' -TimeoutSec 2
            if ($response.StatusCode -eq 200) { $healthy = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    if (!$healthy) { throw "Disposable API did not become healthy. See $apiErr" }

    Push-Location $repoRoot
    try {
        & npx.cmd playwright test @PlaywrightArgs
        $resultCode = $LASTEXITCODE
    } finally { Pop-Location }
} finally {
    if ($apiProcess -and !$apiProcess.HasExited) { Stop-Process -Id $apiProcess.Id -Force }

    # The user id is generated inside this script and exists only in the marked disposable
    # database. Remove any fixture route left by an interrupted browser before the identity.
    try {
        $routes = Invoke-RestMethod -Method Get -Uri "$($status.API_URL)/rest/v1/routes?user_id=eq.$userId&select=id" -Headers $headers
        foreach ($route in @($routes)) {
            $machines = Invoke-RestMethod -Method Get -Uri "$($status.API_URL)/rest/v1/machines?route_id=eq.$($route.id)&select=id" -Headers $headers
            foreach ($machine in @($machines)) {
                $null = Invoke-RestMethod -Method Delete -Uri "$($status.API_URL)/rest/v1/items?machine_id=eq.$($machine.id)" -Headers ($headers + @{ Prefer = 'return=minimal' })
            }
            $null = Invoke-RestMethod -Method Delete -Uri "$($status.API_URL)/rest/v1/sessions?current_route_id=eq.$($route.id)" -Headers ($headers + @{ Prefer = 'return=minimal' })
            $null = Invoke-RestMethod -Method Delete -Uri "$($status.API_URL)/rest/v1/machines?route_id=eq.$($route.id)" -Headers ($headers + @{ Prefer = 'return=minimal' })
            $null = Invoke-RestMethod -Method Delete -Uri "$($status.API_URL)/rest/v1/routes?id=eq.$($route.id)" -Headers ($headers + @{ Prefer = 'return=minimal' })
        }
    } catch { Write-Warning 'Disposable fixture route cleanup needs review.' }

    try { $null = Invoke-RestMethod -Method Delete -Uri "$($status.API_URL)/auth/v1/admin/users/$userId" -Headers $headers } catch { }
    if ($accountId) {
        try { $null = Invoke-RestMethod -Method Delete -Uri "$($status.API_URL)/rest/v1/accounts?id=eq.$accountId" -Headers ($headers + @{ Prefer = 'return=minimal' }) } catch { }
    }
    @(
        'STOCKERAI_DB_TESTS', 'STOCKERAI_TEST_SUPABASE_URL', 'STOCKERAI_TEST_SERVICE_KEY',
        'STOCKERAI_TEST_ANON_KEY', 'STOCKER_TEST_API', 'STOCKERAI_TEST_USER_ID',
        'STOCKERAI_TEST_EMAIL', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'OPENAI_API_KEY'
    ) | ForEach-Object { Remove-Item "Env:$_" -ErrorAction SilentlyContinue }
}

exit $resultCode
