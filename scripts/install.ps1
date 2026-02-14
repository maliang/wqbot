# WQBot 一键安装脚本 (Windows PowerShell)
# 用法: irm https://raw.githubusercontent.com/user/wqbot/main/scripts/install.ps1 | iex

$ErrorActionPreference = "Stop"

# === 仓库配置 ===
# 修改以下变量以适配你的 GitHub 仓库
$RepoOwner = if ($env:WQBOT_REPO_OWNER) { $env:WQBOT_REPO_OWNER } else { "user" }
$RepoName = if ($env:WQBOT_REPO_NAME) { $env:WQBOT_REPO_NAME } else { "wqbot" }
$RepoUrl = "https://github.com/${RepoOwner}/${RepoName}"
$ApiUrl = "https://api.github.com/repos/${RepoOwner}/${RepoName}"

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║           WQBot 一键安装脚本                              ║" -ForegroundColor Cyan
Write-Host "║           智能 AI 管家                                    ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# 检查 Node.js
Write-Host "[1/4] 检查 Node.js..." -ForegroundColor Cyan
try {
    $nodeVersion = (node -v) -replace 'v', ''
    $majorVersion = [int]($nodeVersion.Split('.')[0])
    if ($majorVersion -ge 20) {
        Write-Host "✓ Node.js v$nodeVersion 已安装" -ForegroundColor Green
    } else {
        Write-Host "Node.js 版本过低，需要 v20+" -ForegroundColor Yellow
        Write-Host "请访问 https://nodejs.org/ 安装最新版本"
        exit 1
    }
} catch {
    Write-Host "Node.js 未安装" -ForegroundColor Yellow
    Write-Host "请访问 https://nodejs.org/ 安装 Node.js 20+"
    exit 1
}

# 检查 pnpm
Write-Host "[2/4] 检查 pnpm..." -ForegroundColor Cyan
try {
    pnpm -v | Out-Null
    Write-Host "✓ pnpm 已安装" -ForegroundColor Green
} catch {
    Write-Host "正在安装 pnpm..."
    npm install -g pnpm
    Write-Host "✓ pnpm 已安装" -ForegroundColor Green
}

# 安装 CLI
Write-Host "[3/4] 安装 WQBot CLI..." -ForegroundColor Cyan

$installDir = "$env:USERPROFILE\.wqbot-install"

if (Test-Path $installDir) {
    Write-Host "更新现有安装..."
    Set-Location $installDir
    git pull
} else {
    Write-Host "克隆仓库..."
    git clone "${RepoUrl}.git" $installDir
    Set-Location $installDir
}

Write-Host "安装依赖..."
pnpm install

Write-Host "构建项目..."
pnpm build

Write-Host "链接 CLI..."
Set-Location packages\cli
pnpm link --global

# 添加 pnpm global bin 到 PATH
$pnpmBin = (pnpm bin -g 2>$null)
if ($pnpmBin) {
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$pnpmBin*") {
        [Environment]::SetEnvironmentVariable("Path", "$currentPath;$pnpmBin", "User")
        Write-Host "✓ 已添加到 PATH: $pnpmBin" -ForegroundColor Green
    }
}

Set-Location $env:USERPROFILE

# 下载 GUI（可选）
Write-Host ""
Write-Host "[4/4] 安装桌面应用..." -ForegroundColor Cyan

$installGui = Read-Host "是否下载桌面应用? (y/N)"

if ($installGui -eq 'y' -or $installGui -eq 'Y') {
    try {
        # 获取最新版本
        $releases = Invoke-RestMethod -Uri "${ApiUrl}/releases/latest"
        $latestVersion = $releases.tag_name

        Write-Host "最新版本: $latestVersion"

        # 查找 Windows 安装包
        $asset = $releases.assets | Where-Object { $_.name -like "*.msi" -or $_.name -like "*setup*.exe" } | Select-Object -First 1

        if ($asset) {
            $downloadUrl = $asset.browser_download_url
            $downloadFile = "$env:TEMP\WQBot-Setup.msi"

            Write-Host "下载安装包..."
            Invoke-WebRequest -Uri $downloadUrl -OutFile $downloadFile

            Write-Host "运行安装程序..."
            Start-Process -FilePath "msiexec.exe" -ArgumentList "/i", $downloadFile, "/quiet" -Wait

            Remove-Item $downloadFile -Force
            Write-Host "✓ 桌面应用已安装" -ForegroundColor Green
        } else {
            Write-Host "未找到 Windows 安装包" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "无法获取最新版本，跳过桌面应用安装" -ForegroundColor Yellow
    }
} else {
    Write-Host "跳过桌面应用安装"
}

# 完成
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║           安装完成!                                       ║" -ForegroundColor Green
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "使用方法:"
Write-Host ""
Write-Host "  CLI 对话模式:"
Write-Host "    > wqbot"
Write-Host ""
Write-Host "  单次提问:"
Write-Host '    > wqbot "你好"'
Write-Host ""
Write-Host "  重新配置:"
Write-Host "    > wqbot --setup"
Write-Host ""
if ($installGui -eq 'y' -or $installGui -eq 'Y') {
    Write-Host "  启动桌面应用:"
    Write-Host "    从开始菜单搜索 WQBot 并点击启动"
    Write-Host ""
}
Write-Host "首次运行会自动进入配置向导，设置 AI 模型 API。" -ForegroundColor Cyan
Write-Host ""
