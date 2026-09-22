$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$keyPath = Join-Path $projectRoot 'orbita-upload.jks'
$propertiesPath = Join-Path $projectRoot 'keystore.properties'

if ((Test-Path -LiteralPath $keyPath) -or (Test-Path -LiteralPath $propertiesPath)) {
    throw 'A chave ou o arquivo keystore.properties já existe. Nenhum arquivo foi substituído.'
}

$bytes = New-Object byte[] 36
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$password = [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')

& keytool `
    -genkeypair `
    -v `
    -keystore $keyPath `
    -storepass $password `
    -keypass $password `
    -alias 'orbita-upload' `
    -keyalg RSA `
    -keysize 4096 `
    -validity 10000 `
    -dname 'CN=Orbita Infinita, OU=Mobile, O=Pedro Santos, C=BR'

if ($LASTEXITCODE -ne 0) { throw "keytool falhou com o código $LASTEXITCODE." }

$lines = @(
    'storeFile=orbita-upload.jks',
    "storePassword=$password",
    'keyAlias=orbita-upload',
    "keyPassword=$password"
)
[IO.File]::WriteAllLines($propertiesPath, $lines, [Text.UTF8Encoding]::new($false))

Write-Host 'Chave de upload criada e configurada.'
Write-Host "Faça backup seguro de: $keyPath"
Write-Host "Faça backup seguro de: $propertiesPath"
