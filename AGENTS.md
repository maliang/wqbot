# WQBot Agents

本文档描述 WQBot 项目中的 AI 代理系统。

## 代理概述

WQBot 支持动态代理系统，代理配置存储在 `~/.wqbot/agents/`（全局）或 `.wqbot/agents/`（项目级），格式为 YAML。

代理会根据用户输入自动匹配触发，也可以通过 `@代理名` 手动指定。项目级代理可覆盖同名全局代理。

### 核心模块

代理系统由 `@wqbot/skills` 包中的以下模块实现：

| 模块           | 文件                 | 职责                                    |
| -------------- | -------------------- | --------------------------------------- |
| AgentLoader    | `agent-loader.ts`    | 从 YAML 文件加载代理配置                |
| AgentManager   | `agent-manager.ts`   | 代理注册、匹配、生命周期管理            |
| SkillRegistry  | `skill-registry.ts`  | 技能注册与查询                          |
| ToolRegistry   | `tool-registry.ts`   | 工具注册与 AI SDK 适配                  |
| MarkdownLoader | `markdown-loader.ts` | Markdown 格式技能加载                   |
| MCPClient      | `mcp-client.ts`      | MCP (Model Context Protocol) 客户端集成 |
| KnowledgeTools | `knowledge-tools.ts` | 知识库工具注册（search/add/list）       |

### 代理与模型路由的关系

当代理被匹配时，`ModelRouter` 会使用代理配置中的 `model`、`temperature`、`prompt` 覆盖默认参数：

```
用户输入 → AgentManager.matchAgent() → 匹配到代理
         → ModelRouter.chatStream({ model: agent.model, temperature: agent.temperature, systemPrompt: agent.prompt })
```

---

## 内置代理

### planner (规划代理)

**用途**: 复杂功能的实现规划

**触发场景**:

- 新功能开发
- 大规模重构
- 架构变更

**示例**:

```
用户: 帮我实现用户认证系统
AI: [使用 planner 代理分析需求，制定实现计划]
```

---

### architect (架构代理)

**用途**: 系统设计和架构决策

**触发场景**:

- 技术选型
- 系统设计
- 性能优化方案

---

### tdd-guide (TDD 指导代理)

**用途**: 测试驱动开发指导

**工作流程**:

1. 编写测试 (RED)
2. 运行测试 - 应该失败
3. 编写最小实现 (GREEN)
4. 运行测试 - 应该通过
5. 重构 (IMPROVE)
6. 验证覆盖率 (80%+)

---

### code-reviewer (代码审查代理)

**用途**: 代码质量审查

**检查项**:

- 代码可读性和命名
- 函数大小 (<50 行)、文件大小 (<800 行)
- 嵌套深度 (<4 层)
- 错误处理、安全问题
- 不可变性原则

---

### security-reviewer (安全审查代理)

**用途**: 安全漏洞分析

**检查项**:

- 硬编码密钥
- SQL 注入、XSS、CSRF
- 输入验证
- 敏感信息泄露

---

### build-error-resolver (构建错误解决代理)

**用途**: 修复构建错误

**工作流程**:

1. 分析错误信息
2. 定位问题根源
3. 增量修复
4. 验证修复

---

### e2e-runner (E2E 测试代理)

**用途**: 端到端测试（Playwright）

---

### refactor-cleaner (重构清理代理)

**用途**: 死代码清理、技术债务处理

---

### doc-updater (文档更新代理)

**用途**: API 变更后的文档维护

---

## 预设代理

WQBot 内置 5 个预设代理，存放在 `packages/skills/agents/`：

| 代理 | 文件 | 用途 |
|------|------|------|
| build | build.md | 代码实现和构建 |
| plan | plan.md | 任务规划和分析 |
| review | review.md | 代码审查和质量检查 |
| explore | explore.md | 代码探索和搜索 |
| general | general.md | 通用对话和问答 |

预设代理可通过 `@代理名` 触发，也可被项目级代理覆盖。

---

## 预设技能和规则

### 预设技能 (4个)

| 技能 | 文件 | 用途 |
|------|------|------|
| commit | commit.md | 智能 Git 提交 |
| pr | pr.md | PR 创建和管理 |
| test | test.md | 测试生成和运行 |
| lint | lint.md | 代码检查和修复 |

### 预设规则 (3个)

| 规则 | 文件 | 用途 |
|------|------|------|
| coding-standards | coding-standards.md | 编码规范 |
| security-rules | security-rules.md | 安全规范 |
| git-rules | git-rules.md | Git 工作流 |

规则在每次对话时自动注入到系统提示词中，确保模型遵守项目规范。

---

## 自定义代理

### 代理文件格式

代理配置使用 **Markdown** 格式（使用 frontmatter 存储元数据），存储在 `~/.wqbot/agents/`（全局）或 `.wqbot/agents/`（项目级）。

```yaml
# my-agent.md
---
name: my-agent
description: 我的自定义代理
model: gpt-4o          # 可选，指定模型
temperature: 0.7       # 可选，覆盖默认温度
mode: primary           # 可选，primary|subagent|all
hidden: false          # 可选，是否隐藏
triggers:              # 触发关键词数组
  - "帮我优化"
  - "review代码"
---

# 代理系统提示词

你是一个专业的助手，专注于...

## 职责
- 任务1
- 任务2

## 约束
- 约束1
- 约束2
```

### 配置字段

| 字段        | 类型     | 必填 | 说明                        |
| ----------- | -------- | ---- | --------------------------- |
| name        | string   | 是   | 代理名称                    |
| description | string   | 是   | 代理描述                    |
| prompt      | string   | 是   | 系统提示词（Markdown 正文） |
| model       | string   | 否   | 指定模型（覆盖默认路由）    |
| temperature | number   | 否   | 温度参数                    |
| mode        | string   | 否   | 模式：primary/subagent/all  |
| hidden      | boolean  | 否   | 是否隐藏（不显示在 UI）     |
| color       | string   | 否   | UI 显示颜色（如 #FF6B6B）   |
| triggers    | string[] | 否   | 触发关键词数组，包含匹配    |
| alias       | string   | 否   | 代理别名，简短引用          |
| readonly    | boolean  | 否   | 是否只读模式（不接受工具修改） |

### 增强功能

#### 并行执行

复杂任务可指定多个代理并行处理：

```yaml
---
name: parallel-analyzer
mode: parallel
agents:
  - code-reviewer
  - security-reviewer
---
```

#### 构建/计划切换

代理支持 build 和 plan 两种模式：

```yaml
---
name: implementation-agent
mode: build    # 执行模式 - 直接修改代码
# mode: plan   # 计划模式 - 生成方案供确认
---
```

#### 只读模式

只读代理用于分析任务，不执行任何修改：

```yaml
---
name: analyzer
readonly: true
---
```

#### 代理别名

简短的别名方便快速引用：

```yaml
---
name: code-reviewer
alias: cr
triggers: ["review", "审查"]
---
```

使用：`@cr 分析这段代码`

> 注意：`tools` 字段当前不支持配置，代理默认拥有所有内置工具。

### 可用工具

- `read` - 读取文件
- `write` - 写入文件
- `edit` - 编辑文件
- `search` - 搜索代码
- `bash` - 执行命令
- `glob` - 文件匹配
- `grep` - 内容搜索
- `search_knowledge` - 搜索知识库
- `add_knowledge` - 添加知识到知识库
- `list_knowledge` - 列出知识库集合

---

## 代理使用

### 自动触发

代理根据 `triggers` 数组中的关键词自动匹配用户输入：

```
用户: 帮我规划一下这个功能的实现
AI: [自动匹配 planner 代理]
```

### 手动指定

```
用户: @architect 分析一下这个系统的架构
AI: [使用 architect 代理]
```

### 配置热加载

代理配置支持热加载：

- 添加/修改/删除代理文件后自动生效
- 无需重启 CLI 或 GUI
- 通过 SSE 实时通知前端刷新

---

## 多代理协作

对于复杂任务，可以串联多个代理：

```
用户: 帮我实现并审查用户登录功能

工作流:
1. planner 代理 → 制定实现计划
2. tdd-guide 代理 → 编写测试
3. [实现代码]
4. code-reviewer 代理 → 代码审查
5. security-reviewer 代理 → 安全审查
```

---

## 代理 vs 技能 vs 规则

| 类型      | 用途                                   | 触发方式              | 配置格式    | 模块                |
| --------- | -------------------------------------- | --------------------- | ----------- | ------------------- |
| Agents    | 复杂任务处理，有独立提示词和模型配置   | 自动匹配或 @指定      | Markdown    | `agent-manager.ts`  |
| Skills    | 特定功能执行（Markdown 或 TypeScript） | 斜杠命令 /skill       | .md / .ts   | `skill-registry.ts` |
| Rules     | 行为约束和规范，注入到系统提示词       | 始终生效              | Markdown    | `@wqbot/core`       |
| MCP       | 外部工具服务器集成，扩展可用工具       | 通过 MCP 协议自动注册 | 配置文件    | `mcp-client.ts`     |
| Knowledge | 知识库检索，模型自动调用               | 内置工具自动注册      | config.yaml | `@wqbot/knowledge`  |
| Hooks     | 事件驱动的自动化工作流                 | 事件触发              | .hook       | `hook-manager.ts`   |
| Specs     | 项目规范管理                           | 始终生效              | .md         | `spec-manager.ts`   |
| Orchestrator | 意图分析和任务调度                 | 自动分析              | -           | `orchestrator.ts`   |
| Unattended | 无人值守模式和后台任务               | 定时/队列触发         | config.yaml | `unattended/`       |
| Agents Team | 多代理团队协作                       | 手动/自动             | -           | `agents-team/`      |
| Self-Loop  | 自引用循环和自我改进                 | 手动/自动             | -           | `self-loop/`        |

> 注：Agents、Skills、MCP、Knowledge 注册的工具最终都汇聚到 `ToolRegistry`（来源标记为 `builtin`/`skill`/`mcp`），由 `tool-adapter.ts` 转换为 AI SDK 格式供模型调用。这是内部实现细节，用户无需直接配置。
