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
- **智能编排器**: 意图分析、任务分解、动态资源调度，根据项目上下文自动推荐最佳执行方案
- **Hooks 系统**: 事件驱动的钩子机制，支持自定义自动化工作流
- **Specs 系统**: 项目规范管理，统一代码风格和最佳实践
- **LSP 集成**: Language Server Protocol 客户端，支持代码跳转、重构、诊断
- **企业级功能**: GitHub 集成、配置层级继承、Token 消耗监控和审计日志

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
├── gui-tauri/    # Tauri 桌面应用 (React + Vite + Zustand, sidecar 架构)
└── lsp/          # LSP 客户端 (语言服务器协议支持)

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

## 高级系统

### 智能编排器 (Orchestrator)

WQBot 智能编排器自动分析用户意图并调度最佳资源：

- **意图分析**: 识别任务类型（简单问答、Bug修复、代码审查、重构等）和复杂度
- **任务分解**: 将复杂任务拆分为可并行执行的子任务
- **动态资源调度**: 根据项目上下文自动推荐 agents、skills、rules
- **自适应配置**: 分析项目特征，推荐最优模型和参数

```typescript
// 编排器自动分析用户输入
const intent = await orchestrator.analyzeIntent("帮我实现用户认证系统")
// => { type: 'feature_development', complexity: 'high', confidence: 0.92, ... }
```

### Hooks 系统

事件驱动的自动化工作流：

```yaml
# ~/.wqbot/hooks/pre-commit.hook
name: pre-commit-lint
trigger: git-pre-commit
actions:
  - type: lint
    runner: eslint
  - type: test
    runner: vitest
```

### Specs 系统

项目规范管理，确保团队代码风格一致：

```
~/.wqbot/specs/
├── coding-standards.md    # 编码规范
├── git-rules.md          # Git 工作流规范
└── security-rules.md     # 安全规范
```

### LSP 集成

内置 Language Server Protocol 客户端：

- 代码跳转定义
- 查找引用
- 重命名重构
- 实时诊断
- 代码补全

### 企业级功能

| 功能 | 说明 |
|------|------|
| GitHub 集成 | Issue 分类、PR 审查、@mention 响应 |
| 配置层级 | 项目 → 用户 → 企业三层继承 |
| 审计监控 | Token 消耗、成本统计、操作日志 |

### 无人值守模式

后台任务执行，无需用户交互：

```typescript
// 创建任务调度器
const scheduler = createScheduler()

// 注册定时任务
scheduler.register({
  name: 'git-sync',
  description: '自动提交同步',
  cron: '0 */6 * * *',  // 每6小时
  handler: async (ctx) => {
    // 执行 git sync
    return { success: true }
  },
  config: { timeout: 60000 }
})

scheduler.start()

// 或使用后台任务队列
const executor = getBackgroundExecutor()
executor.registerHandler('build', async (payload) => {
  return await runBuild(payload)
})

executor.enqueue('build', { target: 'production' }, 'high')
```

### 多代理团队 (Agents Team)

多代理协作，共同完成复杂任务：

```typescript
// 创建团队
const team = teamManager.createTeam('DevTeam', [
  { name: 'architect', role: 'coordinator', agent, capabilities: ['design'] },
  { name: 'developer', role: 'worker', agent, capabilities: ['implement'] },
  { name: 'tester', role: 'reviewer', agent, capabilities: ['test'] }
], { mode: 'parallel' })

// 启动协作
const session = await collaborationEngine.startSession(team, tasks, 'iterative')
```

内置团队模板：代码审查团队、开发团队、头脑风暴团队

### 自引用循环 (Self-Referential Loop)

类似 ralphex 的自我改进循环：

```typescript
// 快速改进
await quickImprove("优化代码性能")

// 完整 Ralph-Ex 循环
const result = await startRalphEx("实现用户认证系统")
// => { success: true, finalScore: 85, iterations: 8, learnedRules: 5 }

// 手动控制
const controller = getLoopController()
controller.registerAnalyzer('code', async (input) => {
  return await analyzeCode(input)
})

const session = await controller.startLoop({ task: "优化代码" }, {
  maxIterations: 10,
  convergenceThreshold: 5
})
```

循环阶段：分析 → 计划 → 执行 → 验证 → 改进 → 完成

### 多渠道消息接入

通过 Telegram、Slack、WhatsApp、Discord 控制 AI 助手：

```typescript
import { getChannelManager } from '@wqbot/core'

const manager = getChannelManager()

// 配置 Telegram
await manager.registerChannel({
  enabled: true,
  platform: 'telegram',
  credentials: { telegramBotToken: 'xxx' }
})

// 配置 Slack
await manager.registerChannel({
  enabled: true,
  platform: 'slack',
  credentials: { slackBotToken: 'xxx' }
})

// 监听消息
manager.onMessage((event) => {
  if (event.message) {
    // 处理消息
    console.log(event.message.content)
  }
})
```

### 浏览器自动化

Playwright 集成，支持网页抓取和自动化操作：

```typescript
import { getBrowserManager, SemanticSnapshot } from '@wqbot/core'

const browser = getBrowserManager()
await browser.launch()

const contextId = await browser.createContext()
const pageId = await browser.createPage(contextId)

await browser.navigate(pageId, 'https://example.com')
const content = await browser.getContent(pageId)

// Semantic Snapshot (OpenCLAW 风格)
const snapshot = await SemanticSnapshot.capture(pageId, browser)
console.log(snapshot.interactiveElements)
```

### Shell 执行 (信任模式)

绕过沙箱限制，执行真实终端命令：

```typescript
import { createTrustedExecutor } from '@wqbot/core'

// 创建信任模式执行器
const shell = createTrustedExecutor({
  allowedPaths: ['/home/user/projects/*'],
  requireApproval: false
})

// 执行命令
const result = await shell.execute('npm run build')
console.log(result.stdout)

// 流式输出
shell.executeStream('npm run dev', (event) => {
  console.log(event.data)
})
```

**三种模式**:
| 模式 | 说明 |
|------|------|
| sandbox | 严格安全限制 (默认) |
| trust | 信任模式，允许真实命令执行 |
| readonly | 只读模式，仅允许 cat/grep 等查询命令 |

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
