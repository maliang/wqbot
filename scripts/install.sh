#!/bin/bash

# WQBot 一键安装脚本 (macOS/Linux)
# 用法: curl -fsSL https://raw.githubusercontent.com/user/wqbot/main/scripts/install.sh | bash

set -e

# === 仓库配置 ===
# 修改以下变量以适配你的 GitHub 仓库
REPO_OWNER="${WQBOT_REPO_OWNER:-user}"
REPO_NAME="${WQBOT_REPO_NAME:-wqbot}"
REPO_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}"
REPO_RAW_URL="https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main"
API_URL="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║           WQBot 一键安装脚本                              ║${NC}"
echo -e "${CYAN}║           智能 AI 管家                                    ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# 检测系统
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
    Linux*)     PLATFORM="linux";;
    Darwin*)    PLATFORM="macos";;
    *)          echo -e "${RED}不支持的操作系统: $OS${NC}"; exit 1;;
esac

case "$ARCH" in
    x86_64)     ARCH="x64";;
    aarch64)    ARCH="arm64";;
    arm64)      ARCH="arm64";;
    *)          echo -e "${RED}不支持的架构: $ARCH${NC}"; exit 1;;
esac

echo -e "检测到系统: ${GREEN}$PLATFORM-$ARCH${NC}"
echo ""

# 检查 Node.js
echo -e "${CYAN}[1/4]${NC} 检查 Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 20 ]; then
        echo -e "${GREEN}✓${NC} Node.js $(node -v) 已安装"
    else
        echo -e "${YELLOW}Node.js 版本过低，需要 v20+${NC}"
        echo "请访问 https://nodejs.org/ 安装最新版本"
        exit 1
    fi
else
    echo -e "${YELLOW}Node.js 未安装${NC}"
    echo "请访问 https://nodejs.org/ 安装 Node.js 20+"
    exit 1
fi

# 检查 pnpm
echo -e "${CYAN}[2/4]${NC} 检查 pnpm..."
if command -v pnpm &> /dev/null; then
    echo -e "${GREEN}✓${NC} pnpm 已安装"
else
    echo "正在安装 pnpm..."
    npm install -g pnpm
    echo -e "${GREEN}✓${NC} pnpm 已安装"
fi

# 下载并安装
echo -e "${CYAN}[3/4]${NC} 安装 WQBot CLI..."

# 方式 1: 通过 npm 安装（如果已发布）
# npm install -g wqbot

# 方式 2: 从源码安装
INSTALL_DIR="$HOME/.wqbot-install"
if [ -d "$INSTALL_DIR" ]; then
    echo "更新现有安装..."
    cd "$INSTALL_DIR"
    git pull
else
    echo "克隆仓库..."
    git clone "${REPO_URL}.git" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

echo "安装依赖..."
pnpm install

echo "构建项目..."
pnpm build

echo "链接 CLI..."
cd packages/cli
pnpm link --global

# 检查 pnpm global bin 是否在 PATH 中
PNPM_BIN=$(pnpm bin -g 2>/dev/null)
if [ -n "$PNPM_BIN" ] && [[ ":$PATH:" != *":$PNPM_BIN:"* ]]; then
    echo ""
    echo -e "${YELLOW}提示: pnpm global bin 不在 PATH 中${NC}"
    echo -e "  请运行以下命令添加:"
    echo ""
    echo "  export PATH=\"$PNPM_BIN:\$PATH\""
    echo ""
    echo "  添加到 ~/.bashrc 或 ~/.zshrc 以永久生效"
fi

# 下载 GUI（可选）
echo ""
echo -e "${CYAN}[4/4]${NC} 安装桌面应用..."

read -p "是否下载桌面应用? (y/N): " INSTALL_GUI

if [[ "$INSTALL_GUI" =~ ^[Yy]$ ]]; then
    # 获取最新版本
    LATEST_RELEASE=$(curl -s "${API_URL}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')

    if [ -z "$LATEST_RELEASE" ]; then
        echo -e "${YELLOW}无法获取最新版本，跳过桌面应用安装${NC}"
    else
        echo "最新版本: $LATEST_RELEASE"

        if [ "$PLATFORM" = "macos" ]; then
            DOWNLOAD_URL="${REPO_URL}/releases/download/$LATEST_RELEASE/WQBot_${LATEST_RELEASE#v}_universal.dmg"
            DOWNLOAD_FILE="/tmp/WQBot.dmg"

            echo "下载 macOS 安装包..."
            curl -L -o "$DOWNLOAD_FILE" "$DOWNLOAD_URL"

            echo "挂载 DMG..."
            hdiutil attach "$DOWNLOAD_FILE"

            echo "复制到 Applications..."
            cp -R "/Volumes/WQBot/WQBot.app" /Applications/

            echo "卸载 DMG..."
            hdiutil detach "/Volumes/WQBot"

            rm "$DOWNLOAD_FILE"
            echo -e "${GREEN}✓${NC} 桌面应用已安装到 /Applications/WQBot.app"

        elif [ "$PLATFORM" = "linux" ]; then
            if [ "$ARCH" = "arm64" ]; then
                DOWNLOAD_URL="${REPO_URL}/releases/download/$LATEST_RELEASE/wqbot_${LATEST_RELEASE#v}_aarch64.AppImage"
            else
                DOWNLOAD_URL="${REPO_URL}/releases/download/$LATEST_RELEASE/wqbot_${LATEST_RELEASE#v}_amd64.AppImage"
            fi
            DOWNLOAD_FILE="$HOME/.local/bin/WQBot.AppImage"

            mkdir -p "$HOME/.local/bin"

            echo "下载 Linux AppImage..."
            curl -L -o "$DOWNLOAD_FILE" "$DOWNLOAD_URL"
            chmod +x "$DOWNLOAD_FILE"

            echo -e "${GREEN}✓${NC} 桌面应用已安装到 $DOWNLOAD_FILE"
        fi
    fi
else
    echo "跳过桌面应用安装"
fi

# 完成
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           安装完成!                                       ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "使用方法:"
echo ""
echo "  CLI 对话模式:"
echo "    $ wqbot"
echo ""
echo "  单次提问:"
echo "    $ wqbot \"你好\""
echo ""
echo "  重新配置:"
echo "    $ wqbot --setup"
echo ""
if [[ "$INSTALL_GUI" =~ ^[Yy]$ ]]; then
    if [ "$PLATFORM" = "macos" ]; then
        echo "  启动桌面应用:"
        echo "    打开 Launchpad 或 Applications 文件夹，点击 WQBot"
    elif [ "$PLATFORM" = "linux" ]; then
        echo "  启动桌面应用:"
        echo "    $ ~/.local/bin/WQBot.AppImage"
    fi
    echo ""
fi
echo -e "${CYAN}首次运行会自动进入配置向导，设置 AI 模型 API。${NC}"
echo ""
