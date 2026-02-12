# WQBot - 智能 AI 管家

## 项目概述

WQBot 是一个跨平台 AI 助手系统，支持多模型路由、动态技能系统和 Token 优化对话管理。

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
wqbot -m claude-sonnet-4-5 "帮我写一个排序算法"

# 重新配置 API
wqbot --setup

# 启动后端服务（供 GUI 使用，GUI 会自动启动）
wqbot serve

# 连接远程后端（独立模式）
wqbot --standalone --host 192.168.1.100 --port 3721
```

### 运行模式

| 模式 | 命令 | 说明 |
|------|------|------|
| 对话模式 | `wqbot` | 默认模式，进入交互式对话 |
| 单次模式 | `wqbot "问题"` | 回答后自动退出 |
| 服务模式 | `wqbot serve` | 启动 HTTP 后端 |
| 独立模式 | `wqbot --standalone` | 连接远程后端服务 |

## 技术栈

- **运行时**: Node.js 20+
- **包管理**: pnpm (monorepo)
- **语言**: TypeScript (ESM)
- **后端**: Fastify + SSE
- **CLI**: Commander.js + Ink (React CLI)
- **GUI**: Tauri + React + Vite
- **数据库**: SQLite (sql.js)
- **测试**: Vitest

## 项目结构

```
packages/
├── backend/      # HTTP 后端服务 (Fastify)
├── cli/          # CLI 客户端 (Ink)
├── gui-tauri/    # Tauri 桌面应用
├── core/         # 核心模块 (配置、日志、事件、i18n、API配置)
├── storage/      # 存储模块 (SQLite、对话、设置、Token优化)
├── models/       # AI 模型路由 (OpenAI、Anthropic、DeepSeek、Ollama)
├── skills/       # 技能系统 (注册、市场、执行)
└── security/     # 安全模块 (沙箱、权限、审计)

scripts/
├── install.js        # Node.js 安装脚本
├── install.sh        # macOS/Linux 一键安装
├── install.ps1       # Windows PowerShell 安装
└── build-installer.js # 安装包构建脚本

.github/
└── workflows/
    └── release.yml   # GitHub Actions 自动构建发布
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
pnpm build:gui        # 构建 Tauri GUI
pnpm build:installer  # 构建安装包

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

# 清理
pnpm clean            # 清理构建产物
```

## 配置系统

### 目录结构

```
全局: ~/.wqbot/
├── api-keys.yaml   # API 密钥配置（CLI/GUI 共用）
├── config.yaml     # 通用配置
├── rules/          # 全局规则 (*.md)
├── skills/         # 全局技能 (*.ts)
└── agents/         # 全局代理 (*.yaml)

项目: .wqbot/
├── config.yaml     # 项目配置（覆盖全局）
├── rules/          # 项目规则
├── skills/         # 项目技能
└── agents/         # 项目代理
```

### 热加载

配置文件变更后自动生效，无需重启。

### API 配置

CLI 和 GUI 共享 `~/.wqbot/api-keys.yaml` 配置文件：

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

## 编码规范

### 不可变性 (重要)

始终创建新对象，禁止直接修改：

```typescript
// 错误
function updateUser(user, name) {
  user.name = name  // 禁止修改!
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
  age: z.number().int().min(0).max(150)
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

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/chat/send` | POST | 发送消息 (SSE 流式) |
| `/api/chat/conversations` | GET | 对话列表 |
| `/api/chat/conversations/:id` | GET | 获取对话 |
| `/api/config` | GET | 配置列表 |
| `/api/config/:type/:name` | PUT | 更新配置 |
| `/api/config/:type/:name/toggle` | POST | 切换配置启用状态 |
| `/api/settings` | GET/PUT | 获取/更新设置 |
| `/api/skills` | GET | 技能列表 |
| `/api/tasks` | GET | 任务列表 |
| `/api/tasks/:id/cancel` | POST | 取消任务 |

## 安全注意事项

- 禁止硬编码密钥/密码
- 所有用户输入必须验证
- 使用参数化查询防止 SQL 注入
- 错误消息不泄露敏感信息
- API Key 存储在用户目录，不提交到版本控制

## 调试

```bash
# 启用调试日志
DEBUG=wqbot:* pnpm start

# 查看特定模块日志
DEBUG=wqbot:backend pnpm start:server
```

## 构建安装包

```bash
# 构建当前平台
pnpm build:installer

# 构建指定平台
pnpm build:installer:win    # Windows (.exe, .msi)
pnpm build:installer:mac    # macOS (.dmg)
pnpm build:installer:linux  # Linux (.AppImage, .deb)
```

安装包输出目录：`dist/installers/`

## 发布流程

1. 更新版本号：`pnpm version <major|minor|patch>`
2. 创建 Git Tag：`git tag v0.1.0`
3. 推送 Tag：`git push origin v0.1.0`
4. GitHub Actions 自动构建并发布到 Releases
