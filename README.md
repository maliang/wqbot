# WQBot - 智能 AI 管家

<p align="center">
  <strong>跨平台 AI 助手系统</strong>
</p>

<p align="center">
  多模型路由 · 动态技能系统 · MCP 集成 · Token 优化 · OpenAI 兼容接口
</p>

---

## 特性

- **多模型路由**: OpenAI、Anthropic、Google、Groq、DeepSeek、Ollama 等，按任务类型/复杂度智能路由
- **知识库**: FTS5 全文检索 + 可选向量语义检索，导入文档后模型自动检索参考
- **动态技能系统**: 即时生成并生效 rules/skills/agents（全局或项目级），支持 Markdown 和 TypeScript 技能
- **MCP 集成**: 通过 Model Context Protocol 接入外部工具服务器
- **Agent 自动匹配**: 根据用户输入自动匹配最合适的代理，覆盖模型和提示词
- **Token 优化**: 三阶段优化（裁剪、压缩、保留），智能管理上下文窗口
- **OpenAI 兼容接口**: 提供 `/v1/chat/completions` 端点，可直接对接 Cursor、Continue、Open WebUI 等工具
- **Git 快照**: 对话过程中自动追踪项目文件变更
- **双端界面**: CLI 命令行 + Tauri 桌面 GUI
- **安全沙箱**: 命令解析、权限管理和审计日志
- **统一配置**: CLI 和 GUI 共享 API 配置，热加载自动生效

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

| 平台    | 安装包                       | 安装方式                   |
| ------- | ---------------------------- | -------------------------- |
| Windows | `WQBot_x.x.x_x64-setup.exe`  | 双击运行安装程序           |
| Windows | `WQBot_x.x.x_x64.msi`        | 双击运行安装程序           |
| macOS   | `WQBot_x.x.x_universal.dmg`  | 打开后拖拽到 Applications  |
| Linux   | `WQBot_x.x.x_amd64.AppImage` | `chmod +x` 后直接运行      |
| Linux   | `wqbot_x.x.x_amd64.deb`      | `sudo dpkg -i wqbot_*.deb` |

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
wqbot -m claude-sonnet-4-20250514 "帮我写一个排序算法"

# 重新配置 API
wqbot --setup

# 启动后端服务（供 GUI 或第三方工具使用）
wqbot serve

# 连接远程后端
wqbot --standalone --host 192.168.1.100 --port 3721
```

### GUI 使用

- **Windows**: 从开始菜单搜索 "WQBot" 并点击启动
- **macOS**: 从 Launchpad 或 Applications 文件夹启动
- **Linux**: 运行 AppImage 或从应用菜单启动

GUI 启动时会自动启动 sidecar 后端服务，无需手动操作。

### 运行模式

| 模式     | 命令                 | 说明                                |
| -------- | -------------------- | ----------------------------------- |
| 对话模式 | `wqbot`              | 默认模式，进入交互式对话            |
| 单次模式 | `wqbot "问题"`       | 回答后自动退出                      |
| 服务模式 | `wqbot serve`        | 启动 HTTP 后端（供 GUI 或远程使用） |
| 独立模式 | `wqbot --standalone` | 连接远程后端服务                    |

### OpenAI 兼容接口

启动后端服务后，第三方工具可通过 OpenAI 兼容接口对接：

```bash
# 启动服务
wqbot serve

# 测试模型列表
curl http://localhost:3721/v1/models

# 测试对话
curl http://localhost:3721/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hello"}]}'
```

在 Cursor / Continue / Open WebUI / ChatBox 中配置：

- **API Base URL**: `http://localhost:3721/v1`
- **API Key**: 任意值（当前无认证）

---

## CLI 斜杠命令

在对话模式中可使用以下命令：

| 命令                                      | 说明                     |
| ----------------------------------------- | ------------------------ | ------------ |
| `/help`                                   | 显示帮助                 |
| `/exit`, `/quit`                          | 退出                     |
| `/clear`                                  | 清屏                     |
| `/model [name]`                           | 查看/切换模型            |
| `/config [key=val]`                       | 查看/修改配置            |
| `/skill [list\|on\|off\|create\|install]` | 管理技能                 |
| `/rule [list\|on\|off\|create]`           | 管理规则                 |
| `/agent [list\|on\|off\|create]`          | 管理代理                 |
| `/task [list\|cancel]`                    | 管理并行任务             |
| `/history`                                | 查看对话历史             |
| `/compact [force]`                        | 手动压缩当前对话的上下文 |
| `/pin <messageId>`                        | 标记消息为重要           |
| `/pin unpin <messageId>`                  | 取消标记消息             |
| `/export [json                            | md]`                     | 导出当前对话 |

---

## 架构

```
┌─────────────────────────────────────────────────────┐
│                    客户端层                          │
│  ┌─────────────┐  ┌─────────────┐                  │
│  │  CLI (Ink)  │  │ Tauri GUI   │                  │
│  └─────────────┘  └─────────────┘                  │
└─────────────────────────────────────────────────────┘
                    ↑ HTTP + SSE
┌─────────────────────────────────────────────────────┐
│           Backend (Fastify + Bun Sidecar)           │
│  ┌───────────┐ ┌───────────┐ ┌───────────────────┐  │
│  │   core    │ │  models   │ │     skills        │  │
│  │ 配置/日志 │ │ 模型路由  │ │ 技能/Agent/MCP    │  │
│  └───────────┘ └───────────┘ └───────────────────┘  │
│  ┌───────────┐ ┌───────────┐ ┌───────────────────┐  │
│  │  storage  │ │ security  │ │  OpenAI 兼容层    │  │
│  │ bun:sqlite│ │ 沙箱/权限 │ │ /v1/chat/...      │  │
│  └───────────┘ └───────────┘ └───────────────────┘  │
│  ┌─────────────────────────────────────────────────┐  │
│  │              knowledge (知识库)                  │  │
│  │  FTS5 全文检索 · 向量语义检索 · 文档分块/导入   │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## 项目结构

```
packages/
├── core/         # 核心模块 (配置、日志、事件、i18n、主题、快照、配置热加载)
├── models/       # AI 模型路由 (OpenAI、Anthropic、Google、Groq、DeepSeek、Ollama、Custom)
├── storage/      # 存储模块 (bun:sqlite、对话管理、设置、Token 三阶段优化)
├── knowledge/    # 知识库 (FTS5 全文检索、向量语义检索、文档分块、Embedding)
├── skills/       # 技能系统 (注册、市场、Markdown 技能、MCP 客户端、Agent 管理)
├── security/     # 安全模块 (沙箱、权限、命令解析、审计)
├── backend/      # HTTP 后端 (Fastify + SSE + OpenAI 兼容接口)
├── cli/          # CLI 客户端 (Commander.js + Ink)
└── gui-tauri/    # Tauri 桌面应用 (React + Vite + Zustand, sidecar 架构)

scripts/
├── install.js          # Node.js 安装脚本
├── install.sh          # macOS/Linux 一键安装
├── install.ps1         # Windows PowerShell 安装
├── build-sidecar.js    # Bun compile 构建 sidecar 二进制
├── build-installer.js  # 安装包构建脚本
├── version-sync.js     # 版本号同步
├── generate-homebrew.js # Homebrew formula 生成
└── generate-scoop.js   # Scoop manifest 生成
```

---

## 配置系统

WQBot 使用**单一配置文件** `config.yaml`，统一管理所有配置。

### 配置目录

```
~/.wqbot/
├── config.yaml     # 主配置文件（API 密钥、应用配置、模型路由）
├── rules/          # 规则 (*.md)
├── skills/         # 技能 (*.md, *.ts)
├── agents/         # 代理 (*.md)
└── knowledge/      # 知识库文件

.wqbot/             # 项目级配置（覆盖全局）
├── config.yaml     # 项目配置（可选）
├── rules/
├── skills/
└── agents/
```

### 配置示例

`~/.wqbot/config.yaml`:

```yaml
# ===== 默认模型 =====
defaultProvider: openai
defaultModel: gpt-4o

# ===== API Providers =====
# 格式：apiKey（可选）、baseUrl/host（可选）、models（可选）
# models: 字符串 或 { id, alias }
providers:
  openai:
    apiKey: sk-xxx
    baseUrl: https://api.openai.com/v1
    models:
      - gpt-4o
      - gpt-4o-mini
      - { id: o1, alias: o1 }
      - { id: o3-mini, alias: o3mini }

  anthropic:
    apiKey: sk-ant-xxx
    models:
      - claude-sonnet-4-20250514
      - claude-opus-4-20250514

  google:
    apiKey: xxx
    baseUrl: https://generativelanguage.googleapis.com
    models:
      - gemini-2.0-flash
      - { id: gemini-1.5-pro, alias: gemini-pro }

  deepseek:
    apiKey: sk-xxx
    models:
      - deepseek-chat

  ollama:
    host: http://localhost:11434
    models:
      - llama3:8b
      - qwen2:7b

  groq:
    apiKey: gsk-xxx
    models:
      - llama3-70b-8192

# ===== 模型路由 =====
routing:
  strategy: balanced  # quality | balanced | economy
  fallbackChain:
    - openai
    - anthropic
    - ollama
  taskMapping:
    simple_qa: [gpt-4o-mini, claude-3-5-haiku-20241022]
    code_generation: [claude-sonnet-4-20250514, deepseek-chat, gpt-4o]
    complex_reasoning: [claude-opus-4-20250514, gpt-4o, o1]

# ===== 应用配置 =====
logLevel: info
logFile: ~/.wqbot/logs/wqbot.log
maxHistoryMessages: 100

# 知识库（默认开启）
knowledge:
  enabled: true
  chunkSize: 1500
  chunkOverlap: 200
  collections:
    - name: default
      dirs: [~/.wqbot/knowledge/]

# 安全沙箱
sandbox:
  enabled: true
  allowedPaths: []
  blockedPaths: [.ssh, .env, credentials, .git/config]
  blockedCommands: [rm -rf /, curl | bash, wget | bash]

# MCP 服务器
mcp:
  filesystem:
    type: local
    command: [npx, -y, @modelcontextprotocol/server-filesystem, ~/docs]
```

### 热加载

配置文件变更后自动生效（chokidar 监听），无需重启应用。

---

## 许可证

---

## 开发

### 环境要求

- Node.js 20+
- pnpm 8.15+
- Bun (构建 sidecar 二进制)
- Rust (构建 Tauri GUI)

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
pnpm build:sidecar    # 构建 sidecar 二进制
pnpm build:gui        # 构建 Tauri GUI (含 sidecar)

# 发布构建
pnpm dist             # 版本同步 + 完整安装包构建
pnpm dist:win         # Windows (.exe, .msi)
pnpm dist:mac         # macOS (.dmg)
pnpm dist:linux       # Linux (.AppImage, .deb)

# 测试
pnpm test             # 运行测试
pnpm test:coverage    # 测试覆盖率

# 代码检查
pnpm lint             # ESLint 检查
pnpm lint:fix         # 自动修复
pnpm typecheck        # TypeScript 类型检查

# 版本管理
pnpm changeset        # 创建 changeset
pnpm version-packages # 应用版本变更 + 同步

# 清理
pnpm clean            # 清理构建产物
```

---

## 技术栈

- **运行时**: Bun (编译为独立二进制) / Node.js 20+
- **包管理**: pnpm 8.15+ (monorepo)
- **语言**: TypeScript (ESM)
- **后端**: Fastify + SSE
- **CLI**: Commander.js + Ink (React CLI)
- **GUI**: Tauri 1.x + React + Vite + Zustand
- **数据库**: bun:sqlite (WAL 模式)
- **AI SDK**: Vercel AI SDK (`ai` + `@ai-sdk/*`)
- **MCP**: `@modelcontextprotocol/sdk`
- **测试**: Vitest
- **版本管理**: Changesets (fixed 模式)

---

## 常见问题

### Q: CLI 和 GUI 的配置是否共享？

是的，CLI 和 GUI 共享同一配置文件 `~/.wqbot/config.yaml`。在任一端配置的 API Key 都可以在另一端使用。

### Q: GUI 启动时提示无法连接后端？

GUI 通过 Tauri sidecar 自动启动后端。如果连接失败，请检查：

1. 端口 3721 是否被占用
2. sidecar 二进制是否已构建（`pnpm build:sidecar`）
3. 查看 Tauri 控制台日志定位错误

### Q: 如何更换 AI 模型？

- CLI: 使用 `/model <name>` 命令或 `wqbot --setup` 重新配置
- GUI: 点击左下角设置按钮，修改默认模型

### Q: 支持哪些 AI 提供商？

| Provider  | 代表模型                                         | 说明                 |
| --------- | ------------------------------------------------ | -------------------- |
| OpenAI    | gpt-4o, gpt-4o-mini, o1, o3                      | 需要 API Key         |
| Anthropic | claude-sonnet-4, claude-opus-4, claude-haiku-3.5 | 需要 API Key         |
| Google    | gemini-pro                                       | 需要 API Key         |
| Groq      | llama3-70b, mixtral-8x7b                         | 需要 API Key         |
| DeepSeek  | deepseek-chat                                    | 需要 API Key         |
| Ollama    | llama3:8b 等                                     | 本地运行，无需 Key   |
| Custom    | 自定义                                           | 任意 OpenAI 兼容端点 |

### Q: 如何接入第三方 API 代理（OpenRouter、API2D、one-api 等）？

两种方式：

**方式 1：自定义 baseUrl** — 在 `~/.wqbot/config.yaml` 中为已有 Provider 指定代理地址：

```yaml
providers:
  openai:
    apiKey: sk-xxx
    baseUrl: https://my-proxy.example.com/v1
```

**方式 2：custom Provider** — 接入任意 OpenAI 兼容端点：

```yaml
providers:
  custom:
    - name: openrouter
      baseUrl: https://openrouter.ai/api/v1
      apiKey: sk-or-xxx
      models:
        - openai/gpt-4o
        - anthropic/claude-sonnet-4
```

API Key 还支持变量替换，避免明文存储：`{env:VAR_NAME}`、`{file:~/.secrets/key}`、`${VAR_NAME}`。

### Q: 如何让第三方工具使用 WQBot 的模型？

启动 `wqbot serve` 后，在第三方工具中配置 API Base URL 为 `http://localhost:3721/v1`，API Key 填任意值。支持所有 OpenAI Chat Completions 兼容的客户端。

---

## 许可证

MIT
