param(
  [string]$Version,
  [switch]$SkipBuild,
  [switch]$RepairExisting
)

$ErrorActionPreference = 'Stop'
$utf8WithoutBom = [Text.UTF8Encoding]::new($false)
$OutputEncoding = $utf8WithoutBom
[Console]::OutputEncoding = $utf8WithoutBom

if ($PSVersionTable.PSVersion.Major -lt 7) {
  throw '请使用 PowerShell 7 或更高版本运行此脚本。'
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repositoryRoot

$package = Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = [string]$package.version
}
$Version = $Version -replace '^v', ''
if ($Version -ne [string]$package.version) {
  throw "标签版本 $Version 与 package.json 版本 $($package.version) 不一致。"
}

$tagName = "v$Version"
$productName = '自动点击流程台'
$sourceAttachmentName = "${productName}_${Version}_x64-setup.exe"
$uploadAttachmentName = "macro-flow_${Version}_x64-setup.exe"
$installerPath = Join-Path `
  $repositoryRoot `
  "src-tauri\target\release\bundle\nsis\$sourceAttachmentName"
$uploadPath = Join-Path `
  $repositoryRoot `
  "src-tauri\target\release\bundle\nsis\$uploadAttachmentName"

$localTag = git tag --list $tagName
if ($LASTEXITCODE -ne 0 -or $localTag -ne $tagName) {
  throw "本地不存在标签 $tagName，请先创建并推送该标签。"
}

$remoteTag = git ls-remote --tags origin "refs/tags/$tagName"
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($remoteTag)) {
  throw "远程仓库不存在标签 $tagName，请先执行 git push origin $tagName。"
}

if (-not $SkipBuild) {
  pnpm typecheck
  if ($LASTEXITCODE -ne 0) { throw 'TypeScript 检查失败。' }

  pnpm test
  if ($LASTEXITCODE -ne 0) { throw '测试失败。' }

  cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
  if ($LASTEXITCODE -ne 0) { throw 'Rust 格式检查失败。' }

  cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
  if ($LASTEXITCODE -ne 0) { throw 'Rust Clippy 检查失败。' }

  pnpm tauri:build
  if ($LASTEXITCODE -ne 0) { throw 'Tauri 安装包构建失败。' }
}

if (-not (Test-Path -LiteralPath $installerPath)) {
  throw "安装包不存在：$installerPath"
}

$installerHash = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash
$installerSize = [math]::Round((Get-Item -LiteralPath $installerPath).Length / 1MB, 2)
$previousTag = git tag --sort=-version:refname |
  Where-Object { $_ -ne $tagName } |
  Select-Object -First 1

if ($previousTag) {
  $changeLines = @(
    git -c i18n.logOutputEncoding=utf-8 log `
      --encoding=UTF-8 `
      --pretty=format:'- %s' `
      "$previousTag..$tagName"
  )
} else {
  $changeLines = @('- 首个公开发行版')
}

if ($changeLines.Count -eq 0) {
  $changeLines = @('- 稳定性改进和问题修复')
}

$changeText = $changeLines -join "`n"
$releaseNotes = @"
## 更新内容

$changeText

## 下载与安装

下载附件 ``$uploadAttachmentName`` 后运行即可安装。

- 系统要求：Windows 10/11 64 位
- 安装方式：当前用户安装，无需管理员权限
- 安装包大小：$installerSize MB
- SHA-256：``$installerHash``

> 当前安装程序未使用商业代码签名，Windows SmartScreen 可能显示安全提示。
"@

$secureToken = $null
$tokenPointer = [IntPtr]::Zero
$plainToken = $null

try {
  if ([string]::IsNullOrWhiteSpace($env:GITEE_TOKEN)) {
    $secureToken = Read-Host '请输入新的 Gitee 私人令牌' -AsSecureString
    $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
  } else {
    $plainToken = $env:GITEE_TOKEN.Trim()
  }
  if ($plainToken -notmatch '^[0-9a-fA-F]{32}$') {
    throw 'Gitee 令牌格式无效。'
  }

  $headers = @{
    Authorization = "token $plainToken"
    Accept = 'application/json'
  }
  $apiBase = 'https://gitee.com/api/v5/repos/nbshree/shree-macro-flow-tauri'

  $user = Invoke-RestMethod `
    -Uri 'https://gitee.com/api/v5/user' `
    -Headers $headers `
    -Method Get
  if ($user.login -ne 'nbshree') {
    throw '令牌所属账号不是预期的 nbshree。'
  }

  $releases = @(Invoke-RestMethod `
      -Uri "$apiBase/releases?per_page=100" `
      -Headers $headers `
      -Method Get)
  $existingRelease = $releases |
    Where-Object { $_.tag_name -eq $tagName } |
    Select-Object -First 1
  if ($existingRelease -and -not $RepairExisting) {
    throw "$tagName 的发行版已经存在，未重复发布。"
  }

  $payload = @{
    tag_name = $tagName
    name = "$productName $tagName"
    body = $releaseNotes
    prerelease = $false
    target_commitish = 'main'
  } | ConvertTo-Json

  if ($existingRelease) {
    $release = Invoke-RestMethod `
      -Uri "$apiBase/releases/$($existingRelease.id)" `
      -Headers $headers `
      -Method Patch `
      -ContentType 'application/json; charset=utf-8' `
      -Body ([Text.Encoding]::UTF8.GetBytes($payload))
  } else {
    $release = Invoke-RestMethod `
      -Uri "$apiBase/releases" `
      -Headers $headers `
      -Method Post `
      -ContentType 'application/json; charset=utf-8' `
      -Body ([Text.Encoding]::UTF8.GetBytes($payload))
  }

  $currentRelease = Invoke-RestMethod `
    -Uri "$apiBase/releases/$($release.id)" `
    -Headers $headers `
    -Method Get
  $attachment = @($currentRelease.assets) |
    Where-Object { $_.name -eq $uploadAttachmentName } |
    Select-Object -First 1

  if (-not $attachment) {
    Copy-Item -LiteralPath $installerPath -Destination $uploadPath -Force
    $attachment = Invoke-RestMethod `
      -Uri "$apiBase/releases/$($release.id)/attach_files" `
      -Headers $headers `
      -Method Post `
      -Form @{ file = Get-Item -LiteralPath $uploadPath }
  }

  $verifiedRelease = Invoke-RestMethod `
    -Uri "$apiBase/releases/$($release.id)" `
    -Headers $headers `
    -Method Get

  Write-Host ''
  Write-Host "发行成功：$($verifiedRelease.html_url)"
  Write-Host "安装包：$($attachment.browser_download_url)"
  Write-Host "SHA-256：$installerHash"

  $garbledAttachments = @($verifiedRelease.assets) |
    Where-Object { $_.name -match '^=\?utf-8\?[bq]\?.+\?=$' }
  if ($garbledAttachments.Count -gt 0) {
    Write-Warning '检测到旧的乱码附件，请在 Gitee 发行版编辑页面中手动删除它。'
  }
} finally {
  if (Test-Path -LiteralPath $uploadPath) {
    Remove-Item -LiteralPath $uploadPath -Force
  }
  if ($tokenPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
  }
  $plainToken = $null
  Remove-Variable plainToken -ErrorAction SilentlyContinue
  Remove-Variable secureToken -ErrorAction SilentlyContinue
}
