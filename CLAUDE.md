# WQBot - 智能 AI 管家

## 项目概述

WQBot 是一个跨平台 AI 助手系统，支持多模型路由、动态技能系统、MCP 集成、Agent 自动匹配、知识库检索和 Token 优化对话管理。

## 安装

### 快速安装

**一键安装脚本:**

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/user/wqbot/main/scripts/install.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/user/wqbot/main/scripts/install.ps1 | iex
```

**下载安装包:**
从 [GitHub Releases](https://github.com/user/wqbot/releases) 下载适合你系统的安装包，双击安装即可。

### 从源码安装

```bash
# 克隆项目
git clone <repo-url>
cd wqbot

# 一键安装
pnpm install:all

# 或手动安装
pnpm install && pnpm build
cd packages/cli && pnpm link --global
```

### 使用方式

```bash
# 进入对话模式（首次运行自动配置 API）
wqbot

# 单次提问
wqbot "你好，请介绍一下自己"

# 指定模型
wqbot -m claude-sonnet-4-20250514 "帮我写一个排序算法"

# 重新配置 API
wqbot --setup

# 启动后端服务（供 GUI 或第三方工具使用）
wqbot serve

# 连接远程后端（独立模式）
wqbot --standalone --host 192.168.1.100 --port 3721
```

### 运行模式

| 模式     | 命令                 | 说明                     |
| -------- | -------------------- | ------------------------ |
| 对话模式 | `wqbot`              | 默认模式，进入交互式对话 |
| 单次模式 | `wqbot "问题"`       | 回答后自动退出           |
| 服务模式 | `wqbot serve`        | 启动 HTTP 后端           |
| 独立模式 | `wqbot --standalone` | 连接远程后端服务         |

### CLI 选项

| 选项                      | 说明                       |
| ------------------------- | -------------------------- |
| `-m, --model <model>`     | 指定使用的模型             |
| `-c, --conversation <id>` | 继续指定的对话             |
| `--serve`                 | 启动后端服务               |
| `--standalone`            | 独立模式，连接远程后端     |
| `--port <port>`           | 服务端口（默认 3721）      |
| `--host <host>`           | 服务地址（默认 127.0.0.1） |
| `--no-history`            | 不加载历史记录             |
| `--setup`                 | 重新运行配置向导           |

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

## 项目结构

```
packages/
├── core/         # 核心模块 (配置、日志、事件、i18n、主题、API配置、快照、配置热加载)
├── models/       # AI 模型路由 (OpenAI、Anthropic、Google、Groq、DeepSeek、Ollama、Custom)
├── storage/      # 存储模块 (bun:sqlite、对话管理、设置、Token 三阶段优化)
├── knowledge/    # 知识库 (FTS5 全文检索、向量语义检索、文档分块、Embedding、知识工具)
├── skills/       # 技能系统 (注册、市场、Markdown 技能、MCP 客户端、Agent 管理、工具注册)
├── security/     # 安全模块 (沙箱、权限、命令解析、审计)
├── backend/      # HTTP 后端服务 (Fastify + SSE + OpenAI 兼容接口)
├── cli/          # CLI 客户端 (Commander.js + Ink)
├── gui-tauri/    # Tauri 桌面应用 (React + Vite + Zustand, sidecar 架构)
└── lsp/          # LSP 客户端 (语言服务器协议支持)

scripts/
├── install.js          # Node.js 安装脚本
├── install.sh          # macOS/Linux 一键安装
├── install.ps1         # Windows PowerShell 安装
├── build-sidecar.js    # Bun compile 构建 sidecar 二进制
├── build-installer.js  # 安装包构建脚本
├── version-sync.js     # 版本号同步 (core → Cargo.toml, tauri.conf.json, 根 package.json)
├── generate-homebrew.js # Homebrew formula 生成
└── generate-scoop.js   # Scoop manifest 生成

docs/
├── opencode-reference-plan.md  # OpenCode 参考重构方案
└── review-issues.md            # 代码审查问题记录

.github/workflows/
└── release.yml   # GitHub Actions 自动构建发布 (Changesets + 多平台构建)
```

## 常用命令

```bash
# 安装依赖
pnpm install

# 开发
pnpm dev              # 所有包并行开发
pnpm dev:cli          # CLI 开发
pnpm dev:backend      # 后端开发
pnpm dev:gui          # Tauri GUI 开发

# 构建
pnpm build            # 构建所有包
pnpm build:cli        # 构建 CLI
pnpm build:backend    # 构建后端
pnpm build:gui        # 构建 Tauri GUI (含 sidecar)
pnpm build:sidecar    # 仅构建 sidecar 二进制
pnpm build:installer  # 构建安装包

# 发布构建
pnpm dist             # 版本同步 + 完整安装包构建
pnpm dist:win         # Windows (.exe, .msi)
pnpm dist:mac         # macOS (.dmg)
pnpm dist:linux       # Linux (.AppImage, .deb)

# 运行
pnpm start            # 启动 CLI
pnpm start:server     # 启动后端服务

# 测试
pnpm test             # 运行测试
pnpm test:coverage    # 测试覆盖率

# 代码质量
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

## 高级系统

### 智能编排器 (Orchestrator)

WQBot 智能编排器是核心任务调度系统：

```typescript
// 意图分析
const intent = await orchestrator.analyzeIntent("帮我实现用户认证系统")
// => {
//   type: 'feature_development',
//   complexity: 'high',
//   confidence: 0.92,
//   suggestedAgents: ['planner', 'tdd-guide'],
//   suggestedSkills: ['commit', 'test'],
//   requiresPlanning: true,
//   requiresReview: true
// }

// 任务分解
const tasks = await orchestrator.decomposeTask(intent)
// => [{ agent: 'planner', goal: '制定实现计划' }, ...]

// 资源调度
const resources = await orchestrator.schedule(tasks, projectContext)
```

**核心模块**:

| 模块 | 文件 | 职责 |
|------|------|------|
| ProjectAnalyzer | project-analyzer.ts | 项目结构分析、技术栈检测 |
| DynamicAgentGenerator | dynamic-agent-generator.ts | 动态生成适配任务的代理 |
| AdaptiveConfigurator | adaptive-configurator.ts | 自适应配置推荐 |

### Hooks 系统

事件驱动的自动化工作流：

```yaml
# ~/.wqbot/hooks/pre-commit.hook
name: pre-commit-lint
trigger: git-pre-commit
priority: 100
actions:
  - type: lint
    runner: eslint
    args: [--fix]
  - type: test
    runner: vitest
    failOnError: false
```

**触发事件**:

- `git-pre-commit`: Git pre-commit 钩子
- `git-post-commit`: Git post-commit 钩子
- `agent-before`: Agent 执行前
- `agent-after`: Agent 执行后
- `message-received`: 收到用户消息
- `task-completed`: 任务完成

### Specs 系统

项目规范管理：

```
~/.wqbot/specs/
├── coding-standards.md    # 编码规范
├── git-rules.md          # Git 工作流规范
└── security-rules.md     # 安全规范
```

Specs 在每次对话时自动加载，确保模型遵守项目规范。

### LSP 集成

`@wqbot/lsp` 包提供 Language Server Protocol 支持：

- 代码跳转定义 (`gotoDefinition`)
- 查找引用 (`findReferences`)
- 实时诊断 (`diagnostics`)
- 重命名重构 (`rename`)
- 符号搜索 (`symbols`)

### 企业级功能

| 功能 | 模块 | 说明 |
|------|------|------|
| GitHub 集成 | github.ts | Issue 分类、PR 审查、@mention 响应 |
| 配置层级 | config-hierarchy.ts | 项目→用户→企业三层继承 |
| 审计监控 | audit-monitor.ts | Token 消耗、成本统计、操作日志 |

### 无人值守模式

无人值守后台任务执行，无需用户交互：

```typescript
import { createScheduler, getBackgroundExecutor } from '@wqbot/core'

// 任务调度器 - 定时执行
const scheduler = createScheduler()
scheduler.register({
  name: 'git-sync',
  cron: '0 */6 * * *',
  handler: async (ctx) => {
    // 自动 git add, commit, push
    return { success: true }
  },
  config: { timeout: 60000 }
})
scheduler.start()

// 后台任务队列 - 优先级执行
const executor = getBackgroundExecutor()
executor.registerHandler('build', async (payload) => {
  return await buildProject(payload)
})
const jobId = executor.enqueue('build', { target: 'prod' }, 'high')
```

**CLI 命令**:
```bash
wqbot unattended --daemon        # 守护进程模式
wqbot unattended --schedule     # 显示定时任务
wqbot unattended --status       # 查看状态
```

### 多代理团队 (Agents Team)

多代理协作完成复杂任务：

```typescript
import { getTeamManager, getCollaborationEngine, TEAM_TEMPLATES } from '@wqbot/core'

// 从模板创建团队
const team = await createTeamFromTemplate('codeReview', agents)

// 手动创建团队
const team = teamManager.createTeam('DevTeam', [
  { name: 'architect', role: 'coordinator', agent, capabilities: ['design'] },
  { name: 'developer', role: 'worker', agent, capabilities: ['implement'] },
  { name: 'reviewer', role: 'reviewer', agent, capabilities: ['review'] }
], { mode: 'iterative', autoBalanceLoad: true })

// 添加任务
teamManager.createTask(team.id, '实现用户认证', { priority: 'high' })

// 启动协作
const session = await collaborationEngine.startSession(team, tasks, 'iterative')
```

**团队模式**:
- `parallel`: 并行执行任务
- `sequential`: 顺序执行任务
- `iterative`: 迭代执行 + 评审
- `debate`: 多代理提议 + 投票决策

### 自引用循环 (Self-Referential Loop)

类似 ralphex 的自我改进循环：

```typescript
import { quickImprove, startRalphEx, getLoopController } from '@wqbot/core'

// 快速改进
const session = await quickImprove("优化这段代码的性能")

// Ralph-Ex 完整循环
const result = await startRalphEx("实现用户认证系统")
// 返回: { success, finalScore, iterations, improvements, learnedRules }

// 手动控制
const controller = getLoopController()

// 注册自定义分析器
controller.registerAnalyzer('security', async (input) => {
  return await securityScan(input)
})

// 启动循环
const session = await controller.startLoop(
  { task: "重构登录模块" },
  {
    maxIterations: 10,
    maxDuration: 300000,
    convergenceThreshold: 5,
    autoFixEnabled: true
  }
)

// 监听事件
controller.on('iteration:completed', (event) => {
  console.log(`Iteration ${event.iteration} score:`, event.data?.score)
})
```

**循环阶段**:
1. `analyze` - 分析当前状态
2. `plan` - 生成改进计划
3. `execute` - 执行修改
4. `verify` - 验证改进效果
5. `improve` - 应用额外优化
6. `complete` - 完成

**内置模板**:
| 模板 | 用途 |
|------|------|
| quick | 快速单轮修复 |
| standard | 标准改进流程 |
| thorough | 深度全面分析 |
| ralphex | Ralph-Ex 风格自改进 |

### 多渠道消息接入

支持 Telegram、Slack、WhatsApp、Discord 等消息平台：

```typescript
import { getChannelManager } from '@wqbot/core'

const manager = getChannelManager()

// Telegram
await manager.registerChannel({
  enabled: true,
  platform: 'telegram',
  credentials: { telegramBotToken: process.env.TELEGRAM_TOKEN }
})

// Slack
await manager.registerChannel({
  enabled: true,
  platform: 'slack',
  credentials: { 
    slackBotToken: process.env.SLACK_TOKEN,
    slackSigningSecret: process.env.SLACK_SECRET
  }
})

// WhatsApp
await manager.registerChannel({
  enabled: true,
  platform: 'whatsapp',
  credentials: {
    whatsappPhoneNumberId: process.env.WA_PHONE_ID,
    whatsappAccessToken: process.env.WA_TOKEN
  }
})

// 监听消息
manager.onMessage((event) => {
  console.log(`[${event.platform}] ${event.message?.content}`)
})

// 发送消息
await manager.sendMessage('telegram', {
  chatId: '123456',
  content: 'Hello from WQBot!'
})
```

### 浏览器自动化

Playwright 集成，支持网页抓取和自动化：

```typescript
import { getBrowserManager, SemanticSnapshot } from '@wqbot/core'

const browser = getBrowserManager({ headless: true })

await browser.launch()
const contextId = await browser.createContext()
const pageId = await browser.createPage(contextId)

// 导航
await browser.navigate(pageId, 'https://example.com', {
  waitUntil: 'networkidle'
})

// 操作
await browser.fill(pageId, '#search-input', 'query')
await browser.click(pageId, '#search-button')

// 截图
const screenshot = await browser.screenshot(pageId, { 
  type: 'png',
  fullPage: true 
})

// Semantic Snapshot - 结构化页面信息
const snapshot = await SemanticSnapshot.capture(pageId, browser)
// => { interactiveElements, forms, navigation }

await browser.close()
```

### Shell 执行 (信任模式)

```typescript
import { createSandboxExecutor, createTrustedExecutor, createReadonlyExecutor } from '@wqbot/core'

// 沙箱模式 (默认)
const sandbox = createSandboxExecutor()
const result = await sandbox.execute('ls -la') // 安全检查

// 信任模式 (开发/自动化)
const trusted = createTrustedExecutor({
  allowedCommands: ['npm', 'git', 'pnpm'],
  allowedPaths: ['/home/user/project'],
  requireApproval: true
})

// 执行真实命令
const build = await trusted.execute('npm run build')

// 只读模式 (分析)
const readonly = createReadonlyExecutor()
const files = await readonly.execute('grep -r "TODO" src/')
```

**安全模式对比**:

| 模式 | 功能 | 适用场景 |
|------|------|---------|
| sandbox | 严格安全检查，阻止危险命令 | 生产环境 |
| trust | 白名单命令，可配置路径 | 开发/自动化 |
| readonly | 仅 cat/grep/ls 等查询 | 代码分析 |

## 配置系统

### 目录结构

```
全局: ~/.wqbot/
├── config.yaml     # 主配置文件（API 密钥、应用配置、模型路由、知识库）
├── rules/          # 全局规则 (*.md)
├── skills/         # 全局技能 (*.md, *.ts)
├── agents/         # 全局代理 (*.md)
├── hooks/          # 自动化钩子 (*.hook)
└── specs/          # 项目规范 (*.md)

项目: .wqbot/
├── config.yaml     # 项目配置（覆盖全局）
├── rules/          # 项目规则
├── skills/         # 项目技能
├── agents/         # 项目代理
├── hooks/          # 项目钩子
└── specs/          # 项目规范
```

### 统一配置 (config.yaml)

WQBot 使用**单一配置文件** `config.yaml`，统一管理所有配置：

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

  anthropic:
    apiKey: sk-ant-xxx
    models:
      - claude-sonnet-4-20250514

  google:
    apiKey: xxx
    models:
      - gemini-2.0-flash

  deepseek:
    apiKey: sk-xxx
    models:
      - deepseek-chat

  ollama:
    host: http://localhost:11434
    models:
      - llama3:8b

  groq:
    apiKey: gsk-xxx
    models:
      - llama3-70b-8192

# ===== 模型路由 =====
routing:
  strategy: balanced
  fallbackChain:
    - openai
    - anthropic
    - ollama
  taskMapping:
    simple_qa: [gpt-4o-mini, claude-3-5-haiku-20241022]
    code_generation: [claude-sonnet-4-20250514, deepseek-chat, gpt-4o]
    complex_reasoning: [claude-opus-4-20250514, gpt-4o, o1]

# ===== 知识库（默认开启）=====
knowledge:
  enabled: true
  chunkSize: 1500
  chunkOverlap: 200
  embedding:
    provider: ollama
    model: nomic-embed-text
  collections:
    - name: default
      dirs: [~/.wqbot/knowledge/]

# ===== 安全沙箱 =====
sandbox:
  enabled: true
  allowedPaths: []
  blockedPaths: [.ssh, .env, credentials, .git/config]
  blockedCommands: [rm -rf /, curl | bash, wget | bash]

# ===== MCP 服务器 =====
mcp:
  filesystem:
    type: local
    command: [npx, -y, @modelcontextprotocol/server-filesystem, ~/docs]
```

### 热加载

配置文件变更后自动生效（通过 chokidar 监听），无需重启。变更通过 SSE 实时通知前端刷新。

### 配置变量替换

API Key 支持从环境变量或文件读取，避免明文存储：

```yaml
openai:
  apiKey: "{env:OPENAI_API_KEY}"        # 从环境变量读取
  # 或
  apiKey: "{file:~/.secrets/openai.key}" # 从文件读取
  # 或
  apiKey: "${OPENAI_API_KEY}"            # 兼容语法
```

### 支持的 Provider

| Provider  | 默认模型                 | 说明                   |
| --------- | ------------------------ | ---------------------- |
| openai    | gpt-4o-mini              | 需要 API Key           |
| anthropic | claude-sonnet-4-20250514 | 需要 API Key           |
| google    | gemini-pro               | 需要 API Key           |
| groq      | llama3-70b-8192          | 需要 API Key           |
| deepseek  | deepseek-chat            | 需要 API Key           |
| ollama    | llama3:8b                | 本地运行，无需 Key     |
| custom    | -                        | 自定义 OpenAI 兼容端点 |

### 第三方 API / 代理服务

WQBot 支持通过两种方式接入非官方的第三方 API（如 OpenRouter、API2D、one-api、new-api 等中转服务）：

**方式 1：自定义 baseUrl**

各 Provider 支持 `baseUrl` 配置，可指向代理/中转服务：

```yaml
# ~/.wqbot/config.yaml
providers:
  openai:
    apiKey: sk-xxx
    baseUrl: https://my-proxy.example.com/v1 # 指向中转服务
```

**方式 2：custom Provider**

用于接入任意 OpenAI 兼容端点：

```yaml
# ~/.wqbot/config.yaml
providers:
  custom:
    - name: openrouter
      baseUrl: https://openrouter.ai/api/v1
      apiKey: sk-or-xxx
      models:
        - openai/gpt-4o
        - anthropic/claude-sonnet-4
```

> 注意：当前 custom Provider 仅支持使用数组中的第一个条目。多端点支持为后续增强计划。

## 编码规范

### 不可变性 (重要)

始终创建新对象，禁止直接修改：

```typescript
// 错误
function updateUser(user, name) {
  user.name = name // 禁止修改!
  return user
}

// 正确
function updateUser(user, name) {
  return { ...user, name }
}
```

### 文件组织

- 单个文件 200-400 行，最大 800 行
- 高内聚、低耦合
- 按功能/领域组织，而非按类型

### 错误处理

```typescript
try {
  const result = await riskyOperation()
  return result
} catch (error) {
  console.error('操作失败:', error)
  throw new Error('详细的用户友好消息')
}
```

### 输入验证

使用 Zod 进行输入验证：

```typescript
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0).max(150),
})

const validated = schema.parse(input)
```

## API 设计

### 响应格式

```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  meta?: {
    total: number
    page: number
    limit: number
  }
}
```

### 主要端点

| 端点                                  | 方法    | 说明                |
| ------------------------------------- | ------- | ------------------- |
| `/api/health`                         | GET     | 健康检查            |
| `/api/chat/send`                      | POST    | 发送消息 (SSE 流式) |
| `/api/chat/send-sync`                 | POST    | 发送消息 (非流式)   |
| `/api/chat/conversations`             | GET     | 对话列表            |
| `/api/chat/conversations/:id`         | GET     | 获取对话            |
| `/api/chat/conversations`             | POST    | 创建对话            |
| `/api/chat/conversations/:id`         | DELETE  | 删除对话            |
| `/api/chat/conversations/:id/pin`     | POST    | 标记消息为重要      |
| `/api/chat/conversations/:id/unpin`   | POST    | 取消标记消息        |
| `/api/chat/conversations/:id/export`  | GET     | 导出对话            |
| `/api/chat/conversations/:id/compact` | POST    | 压缩上下文          |
| `/api/chat/events`                    | GET     | SSE 事件流          |
| `/api/config`                         | GET     | 配置列表            |
| `/api/config/:type/:name`             | PUT     | 更新配置            |
| `/api/config/:type/:name/toggle`      | POST    | 切换配置启用状态    |
| `/api/settings`                       | GET/PUT | 获取/更新设置       |
| `/api/skills`                         | GET     | 技能列表            |
| `/api/skills/:name`                   | GET     | 技能详情            |
| `/api/tasks`                          | GET     | 任务列表            |
| `/api/tasks/:id`                      | GET     | 任务详情            |
| `/api/tasks/:id/cancel`               | POST    | 取消任务            |
| `/api/snapshot/track`                 | POST    | 创建 Git 快照       |
| `/api/snapshot/list`                  | GET     | 快照列表            |
| `/api/knowledge/collections`          | GET     | 知识库集合列表      |
| `/api/knowledge/collections`          | POST    | 创建集合            |
| `/api/knowledge/collections/:name`    | DELETE  | 删除集合            |
| `/api/knowledge/documents`            | POST    | 添加文档            |
| `/api/knowledge/documents/:id`        | DELETE  | 删除文档            |
| `/api/knowledge/search`               | GET     | 搜索知识库          |
| `/api/knowledge/reindex`              | POST    | 重新索引            |

### OpenAI 兼容接口

WQBot 提供 OpenAI Chat Completions 兼容接口，可直接对接 Cursor、Continue、Open WebUI、ChatBox 等第三方工具。

| 端点                   | 方法 | 说明                        |
| ---------------------- | ---- | --------------------------- |
| `/v1/models`           | GET  | 返回可用模型列表            |
| `/v1/chat/completions` | POST | 对话补全（支持流式/非流式） |

**对接方式**：在第三方工具中配置：

- API Base URL: `http://localhost:3721/v1`
- API Key: 任意值（当前无认证）

**请求示例**：

```bash
# 非流式
curl http://localhost:3721/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hello"}]}'

# 流式
curl http://localhost:3721/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hello"}],"stream":true}'
```

**支持参数**: `model`、`messages`、`stream`、`temperature`、`max_tokens`、`top_p`

**注意**：OpenAI 兼容接口为无状态接口，不经过对话存储和 Token 优化，调用方自行管理上下文。当前不支持 function calling / tool_choice。

## 安全注意事项

- 禁止硬编码密钥/密码
- 所有用户输入必须验证
- 使用参数化查询防止 SQL 注入
- 错误消息不泄露敏感信息
- API Key 存储在用户目录，不提交到版本控制
- 后端默认仅监听 `127.0.0.1`，通过 `--host` 参数控制访问范围

## 架构说明

### Bun Compile + Tauri Sidecar

GUI 桌面应用采用 sidecar 架构：

- `scripts/build-sidecar.js` 使用 `bun build --compile` 将 backend 和 CLI 编译为独立二进制
- Tauri 通过 `externalBin` 配置启动 sidecar 进程
- 数据库使用 `bun:sqlite` 原生绑定，无需额外依赖

### Token 三阶段优化

对话消息经过三阶段优化后发送给模型：

1. 裁剪超出上下文窗口的历史消息
2. 压缩早期对话摘要
3. 保留最近消息完整性

### 模型路由策略

ModelRouter 支持三种路由策略：

- `quality`: 优先选择最强模型
- `economy`: 优先选择最便宜模型
- `balanced`: 根据任务复杂度自动选择

## 调试

```bash
# 启用调试日志
DEBUG=wqbot:* pnpm start

# 查看特定模块日志
DEBUG=wqbot:backend pnpm start:server
DEBUG=wqbot:model-router pnpm start
```

## 构建安装包

```bash
# 构建当前平台
pnpm dist

# 构建指定平台
pnpm dist:win    # Windows (.exe, .msi)
pnpm dist:mac    # macOS (.dmg)
pnpm dist:linux  # Linux (.AppImage, .deb)
```

安装包输出目录：`dist/installers/`

## 发布流程

1. 创建 changeset：`pnpm changeset`
2. 应用版本变更：`pnpm version-packages`（自动同步到 Cargo.toml、tauri.conf.json）
3. 提交并推送到 main 分支
4. 创建 Git Tag：`git tag v0.x.x && git push origin v0.x.x`
5. GitHub Actions 自动构建多平台安装包并发布到 Releases
