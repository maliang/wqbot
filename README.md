# WQBot - 智能 AI 管家

<p align="center">
  <strong>跨平台 AI 助手系统</strong>
</p>

<p align="center">
  多模型支持 · 动态技能系统 · Token 优化 · 三端界面
</p>

---

## 特性

- **多模型支持**: OpenAI、Anthropic、DeepSeek、Ollama 等，智能路由选择最优模型
- **动态技能系统**: 即时生成并生效 rules/skills/agents（全局或项目级）
- **Token 优化**: 智能压缩上下文，滑动窗口、历史摘要、重要性评分
- **三端界面**: CLI 命令行 + Tauri 桌面 GUI + Web (可选)
- **安全沙箱**: 权限管理和审计日志
- **统一配置**: CLI 和 GUI 共享 API 配置，一次设置处处可用

---

## 快速安装

### 方式 1：一键安装脚本（推荐）

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/user/wqbot/main/scripts/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/user/wqbot/main/scripts/install.ps1 | iex
```

### 方式 2：下载安装包

从 [GitHub Releases](https://github.com/user/wqbot/releases) 下载适合你系统的安装包：

| 平台 | 安装包 | 安装方式 |
|------|--------|----------|
| Windows | `WQBot_x.x.x_x64-setup.exe` | 双击运行安装程序 |
| Windows | `WQBot_x.x.x_x64.msi` | 双击运行安装程序 |
| macOS | `WQBot_x.x.x_universal.dmg` | 打开后拖拽到 Applications |
| Linux | `WQBot_x.x.x_amd64.AppImage` | `chmod +x` 后直接运行 |
| Linux | `wqbot_x.x.x_amd64.deb` | `sudo dpkg -i wqbot_*.deb` |

### 方式 3：从源码安装

```bash
# 克隆项目
git clone https://github.com/user/wqbot.git
cd wqbot

# 一键安装
pnpm install:all

# 或手动安装
pnpm install && pnpm build
cd packages/cli && pnpm link --global
```

---

## 使用方法

### 首次使用

安装后首次运行会自动进入配置向导，设置 AI 模型 API：

```bash
wqbot
# 自动弹出配置向导，选择 AI 提供商并输入 API Key
```

### CLI 使用

```bash
# 进入对话模式
wqbot

# 单次提问
wqbot "你好，请介绍一下自己"

# 指定模型
wqbot -m claude-sonnet-4-5 "帮我写一个排序算法"

# 重新配置 API
wqbot --setup
```

### GUI 使用

- **Windows**: 从开始菜单搜索 "WQBot" 并点击启动
- **macOS**: 从 Launchpad 或 Applications 文件夹启动
- **Linux**: 运行 AppImage 或从应用菜单启动

GUI 启动时会自动启动后端服务，无需手动操作。

### 运行模式

| 模式 | 命令 | 说明 |
|------|------|------|
| 对话模式 | `wqbot` | 默认模式，进入交互式对话 |
| 单次模式 | `wqbot "问题"` | 回答后自动退出 |
| 服务模式 | `wqbot serve` | 启动 HTTP 后端（供 GUI 或远程使用） |
| 独立模式 | `wqbot --standalone` | 连接远程后端服务 |

---

## CLI 斜杠命令

在对话模式中可使用以下命令：

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助 |
| `/exit`, `/quit` | 退出 |
| `/clear` | 清屏 |
| `/model [name]` | 查看/切换模型 |
| `/config [key=val]` | 查看/修改配置 |
| `/skill list\|on\|off` | 管理技能 |
| `/rule list\|on\|off` | 管理规则 |
| `/agent list\|on\|off` | 管理代理 |
| `/task list\|cancel` | 管理并行任务 |
| `/history` | 查看历史 |
| `/compact` | 手动压缩上下文 |
| `/pin` | 标记当前消息为重要 |

---

## 架构

```
┌─────────────────────────────────────────────────────┐
│                    客户端层                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │  CLI (Ink)  │  │ Tauri GUI   │  │  Web (可选) │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────┘
                    ↑ HTTP + SSE
┌─────────────────────────────────────────────────────┐
│              Node.js Backend (Fastify)              │
│  ┌───────────┐ ┌───────────┐ ┌───────────────────┐  │
│  │   core    │ │  models   │ │     skills        │  │
│  │ 配置/日志 │ │ 模型路由  │ │ 动态技能系统      │  │
│  └───────────┘ └───────────┘ └───────────────────┘  │
│  ┌───────────┐ ┌───────────┐ ┌───────────────────┐  │
│  │  storage  │ │ security  │ │ conversation-opt  │  │
│  │ SQLite    │ │ 沙箱/权限 │ │ Token优化         │  │
│  └───────────┘ └───────────┘ └───────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## 项目结构

```
packages/
├── backend/      # HTTP 后端服务 (Fastify + SSE)
├── cli/          # CLI 客户端 (Commander + Ink)
├── gui-tauri/    # Tauri 桌面应用 (React + Vite)
├── core/         # 核心模块 (配置、日志、事件、i18n、API配置)
├── storage/      # 存储模块 (SQLite、对话、设置、Token优化)
├── models/       # AI 模型路由 (OpenAI、Anthropic、DeepSeek、Ollama)
├── skills/       # 技能系统 (注册、市场、执行)
└── security/     # 安全模块 (沙箱、权限、审计)

scripts/
├── install.js    # Node.js 安装脚本
├── install.sh    # macOS/Linux 一键安装
├── install.ps1   # Windows PowerShell 安装
└── build-installer.js  # 安装包构建脚本
```

---

## 配置系统

### 配置目录

```
全局: ~/.wqbot/
├── api-keys.yaml   # API 密钥配置（CLI/GUI 共用）
├── config.yaml     # 通用配置
├── rules/          # 规则 (*.md)
├── skills/         # 技能 (*.ts)
└── agents/         # 代理 (*.yaml)

项目: .wqbot/
├── config.yaml     # 项目配置（覆盖全局）
├── rules/          # 项目规则
├── skills/         # 项目技能
└── agents/         # 项目代理
```

### 热加载

配置文件变更后自动生效，无需重启应用。

### API 配置示例

`~/.wqbot/api-keys.yaml`:
```yaml
defaultProvider: anthropic
defaultModel: claude-sonnet-4-5

anthropic:
  apiKey: sk-ant-xxx

openai:
  apiKey: sk-xxx

deepseek:
  apiKey: sk-xxx

ollama:
  host: http://localhost:11434
```

---

## 开发

### 环境要求

- Node.js 20+
- pnpm 8+
- Rust (构建 GUI 需要)

### 常用命令

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev              # 所有包并行开发
pnpm dev:cli          # CLI 开发
pnpm dev:backend      # 后端开发
pnpm dev:gui          # Tauri GUI 开发

# 构建
pnpm build            # 构建所有包
pnpm build:cli        # 构建 CLI
pnpm build:backend    # 构建后端
pnpm build:gui        # 构建 Tauri GUI
pnpm build:installer  # 构建安装包

# 测试
pnpm test             # 运行测试
pnpm test:coverage    # 测试覆盖率

# 代码检查
pnpm lint             # ESLint 检查
pnpm lint:fix         # 自动修复
pnpm typecheck        # TypeScript 类型检查

# 清理
pnpm clean            # 清理构建产物
```

### 构建安装包

```bash
# 构建当前平台安装包
pnpm build:installer

# 构建指定平台
pnpm build:installer:win    # Windows
pnpm build:installer:mac    # macOS
pnpm build:installer:linux  # Linux
```

构建完成后，安装包位于 `dist/installers/` 目录。

---

## 技术栈

- **运行时**: Node.js 20+
- **包管理**: pnpm (monorepo)
- **语言**: TypeScript (ESM)
- **后端**: Fastify + SSE
- **CLI**: Commander.js + Ink (React CLI)
- **GUI**: Tauri + React + Vite
- **数据库**: SQLite (sql.js)
- **测试**: Vitest

---

## 常见问题

### Q: CLI 和 GUI 的配置是否共享？

是的，CLI 和 GUI 共享同一配置文件 `~/.wqbot/api-keys.yaml`。在任一端配置的 API Key 都可以在另一端使用。

### Q: GUI 启动时提示无法连接后端？

GUI 会自动启动后端服务。如果连接失败，请检查：
1. Node.js 是否已安装
2. 端口 3721 是否被占用
3. 点击"重试连接"按钮

### Q: 如何更换 AI 模型？

- CLI: 使用 `/model <name>` 命令或 `wqbot --setup` 重新配置
- GUI: 点击左下角设置按钮，修改默认模型

### Q: 支持哪些 AI 提供商？

- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude 4.5, Claude 3.5)
- DeepSeek
- Google (Gemini)
- Groq
- Ollama (本地模型)

---

## 许可证

MIT
