import { createModuleLogger } from '@wqbot/core'

const logger = createModuleLogger('command-parser')

export interface ParsedCommand {
  readonly name: string
  readonly args: readonly string[]
  readonly flags: readonly string[]
  readonly pipes: readonly ParsedCommand[]
}

export interface CommandRisk {
  readonly level: 'critical' | 'high' | 'medium'
  readonly description: string
}

export interface CommandAnalysis {
  readonly allowed: boolean
  readonly commands: readonly ParsedCommand[]
  readonly risks: readonly CommandRisk[]
}

// ── 词法分析 ─────────────────────────────────────────────

type TokenType = 'word' | 'pipe' | 'and' | 'or' | 'semicolon' | 'redirect' | 'backtick' | 'subshell'

interface Token {
  readonly type: TokenType
  readonly value: string
}

function tokenize(input: string): readonly Token[] {
  const tokens: Token[] = []
  let i = 0
  const len = input.length

  while (i < len) {
    // 跳过空白
    if (input[i] === ' ' || input[i] === '\t') {
      i++
      continue
    }

    // 管道 / 逻辑或
    if (input[i] === '|') {
      if (input[i + 1] === '|') {
        tokens.push({ type: 'or', value: '||' })
        i += 2
        continue
      }
      tokens.push({ type: 'pipe', value: '|' })
      i++
      continue
    }

    // 逻辑与
    if (input[i] === '&' && input[i + 1] === '&') {
      tokens.push({ type: 'and', value: '&&' })
      i += 2
      continue
    }

    // 分号
    if (input[i] === ';') {
      tokens.push({ type: 'semicolon', value: ';' })
      i++
      continue
    }

    // 重定向
    if (input[i] === '>' || input[i] === '<') {
      let val = input[i]!
      i++
      if (i < len && input[i] === '>') {
        val += '>'
        i++
      }
      tokens.push({ type: 'redirect', value: val })
      continue
    }

    // 反引号命令替换
    if (input[i] === '`') {
      let val = '`'
      i++
      while (i < len && input[i] !== '`') {
        val += input[i]
        i++
      }
      if (i < len) {
        val += '`'
        i++
      }
      tokens.push({ type: 'backtick', value: val })
      continue
    }

    // $() 命令替换
    if (input[i] === '$' && input[i + 1] === '(') {
      let depth = 1
      let val = '$('
      i += 2
      while (i < len && depth > 0) {
        if (input[i] === '(') depth++
        if (input[i] === ')') depth--
        if (depth > 0) val += input[i]
        i++
      }
      val += ')'
      tokens.push({ type: 'subshell', value: val })
      continue
    }

    // 引号字符串
    if (input[i] === '"' || input[i] === "'") {
      const quote = input[i]
      let val = ''
      i++
      while (i < len && input[i] !== quote) {
        if (input[i] === '\\' && quote === '"') {
          i++
          if (i < len) val += input[i]
        } else {
          val += input[i]
        }
        i++
      }
      if (i < len) i++ // 跳过结束引号
      tokens.push({ type: 'word', value: val })
      continue
    }

    // 普通单词
    let word = ''
    while (i < len && !' \t|&;><`'.includes(input[i]!)) {
      if (input[i] === '\\') {
        i++
        if (i < len) word += input[i]
      } else {
        word += input[i]
      }
      i++
    }
    if (word) {
      tokens.push({ type: 'word', value: word })
    }
  }

  return tokens
}

// ── 语法分析 ─────────────────────────────────────────────

function parseTokens(tokens: readonly Token[]): readonly ParsedCommand[] {
  const commands: ParsedCommand[] = []
  let current: { name: string; args: string[]; flags: string[]; pipes: ParsedCommand[] } | null = null

  function flush(): void {
    if (current) {
      commands.push({ ...current, pipes: [...current.pipes] })
      current = null
    }
  }

  for (const token of tokens) {
    switch (token.type) {
      case 'word': {
        if (!current) {
          current = { name: token.value, args: [], flags: [], pipes: [] }
        } else if (token.value.startsWith('-')) {
          current.flags = [...current.flags, token.value]
        } else {
          current.args = [...current.args, token.value]
        }
        break
      }
      case 'pipe': {
        if (current) {
          // 管道：当前命令的 pipes 中追加后续命令
          const pipeBase = { ...current, pipes: [] as ParsedCommand[] }
          flush()
          // 后续命令会被解析为新的 current，最终作为 pipe chain
          commands.pop() // 移除刚 flush 的
          // 重新开始，后续命令会被追加
          current = null
          // 将 pipeBase 暂存，等后续命令解析完再组装
          const restTokens = tokens.slice(tokens.indexOf(token) + 1)
          const piped = parseTokens(restTokens)
          commands.push({
            ...pipeBase,
            pipes: piped,
          })
          return commands
        }
        break
      }
      case 'and':
      case 'or':
      case 'semicolon': {
        flush()
        break
      }
      case 'redirect': {
        // 重定向目标作为 arg
        break
      }
      case 'backtick':
      case 'subshell': {
        if (!current) {
          current = { name: token.value, args: [], flags: [], pipes: [] }
        } else {
          current.args = [...current.args, token.value]
        }
        break
      }
    }
  }

  flush()
  return commands
}

// ── 风险分析规则 ──────────────────────────────────────────

interface RiskRule {
  readonly test: (cmds: readonly ParsedCommand[]) => boolean
  readonly level: CommandRisk['level']
  readonly description: string
}

// 递归收集所有命令（包括管道链）
function flattenCommands(cmds: readonly ParsedCommand[]): readonly ParsedCommand[] {
  const result: ParsedCommand[] = []
  for (const cmd of cmds) {
    result.push(cmd)
    if (cmd.pipes.length > 0) {
      result.push(...flattenCommands(cmd.pipes))
    }
  }
  return result
}

const RISK_RULES: readonly RiskRule[] = [
  // Critical: rm -rf / 或 rm -rf /*
  {
    test: (cmds) =>
      flattenCommands(cmds).some(
        (c) =>
          c.name === 'rm' &&
          c.flags.some((f) => f.includes('r') && f.includes('f')) &&
          c.args.some((a) => a === '/' || a === '/*' || a === '~' || a === '~/*')
      ),
    level: 'critical',
    description: '递归强制删除根目录或用户目录',
  },
  // Critical: mkfs
  {
    test: (cmds) => flattenCommands(cmds).some((c) => c.name.startsWith('mkfs')),
    level: 'critical',
    description: '格式化文件系统',
  },
  // Critical: dd if=
  {
    test: (cmds) =>
      flattenCommands(cmds).some(
        (c) => c.name === 'dd' && c.args.some((a) => a.startsWith('if='))
      ),
    level: 'critical',
    description: '直接磁盘操作',
  },
  // Critical: fork bomb
  {
    test: (_cmds) => false, // fork bomb 在 tokenize 阶段难以结构化检测，保留正则 fallback
    level: 'critical',
    description: 'Fork bomb',
  },
  // High: curl/wget 管道到 shell
  {
    test: (cmds) =>
      flattenCommands(cmds).some(
        (c) =>
          (c.name === 'curl' || c.name === 'wget') &&
          c.pipes.some((p) => ['bash', 'sh', 'zsh'].includes(p.name))
      ),
    level: 'high',
    description: '从网络下载并直接执行脚本',
  },
  // High: chmod 777 /
  {
    test: (cmds) =>
      flattenCommands(cmds).some(
        (c) =>
          c.name === 'chmod' &&
          c.flags.some((f) => f.includes('R')) &&
          c.args.includes('777') &&
          c.args.some((a) => a === '/')
      ),
    level: 'high',
    description: '递归修改根目录权限',
  },
  // High: eval with command substitution
  {
    test: (cmds) =>
      flattenCommands(cmds).some(
        (c) => c.name === 'eval' && c.args.some((a) => a.includes('$(') || a.includes('`'))
      ),
    level: 'high',
    description: 'eval 执行命令替换（潜在注入）',
  },
  // Medium: 包含反引号命令替换
  {
    test: (cmds) =>
      flattenCommands(cmds).some(
        (c) =>
          c.args.some((a) => a.startsWith('`') || a.includes('$('))
      ),
    level: 'medium',
    description: '包含命令替换',
  },
  // High: 写入磁盘设备
  {
    test: (cmds) =>
      flattenCommands(cmds).some(
        (c) => c.args.some((a) => /^\/dev\/[sh]d[a-z]/.test(a))
      ),
    level: 'high',
    description: '写入磁盘设备',
  },
  // Medium: rm 在管道/链中（潜在注入）
  {
    test: (cmds) => {
      const flat = flattenCommands(cmds)
      return flat.length > 1 && flat.some((c) => c.name === 'rm')
    },
    level: 'medium',
    description: '命令链中包含 rm（潜在命令注入）',
  },
]

// ── CommandParser ─────────────────────────────────────────

export class CommandParser {
  /**
   * 解析命令字符串为结构化命令列表
   */
  parse(command: string): readonly ParsedCommand[] {
    try {
      const tokens = tokenize(command)
      return parseTokens(tokens)
    } catch (error) {
      logger.debug('命令解析失败，返回空结果', { command, error })
      return []
    }
  }

  /**
   * 分析命令的安全风险
   */
  analyze(command: string): CommandAnalysis {
    const commands = this.parse(command)
    const risks: CommandRisk[] = []

    for (const rule of RISK_RULES) {
      if (rule.test(commands)) {
        risks.push({ level: rule.level, description: rule.description })
      }
    }

    const allowed = !risks.some((r) => r.level === 'critical' || r.level === 'high')

    return { allowed, commands, risks }
  }

  /**
   * 从命令中提取文件路径
   */
  extractPaths(command: string): readonly string[] {
    const commands = this.parse(command)
    const paths: string[] = []

    for (const cmd of flattenCommands(commands)) {
      for (const arg of cmd.args) {
        // 看起来像路径的参数（以 / 或 ./ 或 ~/ 开头，或包含 /）
        if (
          arg.startsWith('/') ||
          arg.startsWith('./') ||
          arg.startsWith('../') ||
          arg.startsWith('~/') ||
          (arg.includes('/') && !arg.startsWith('-'))
        ) {
          paths.push(arg)
        }
      }
    }

    return paths
  }
}

// 单例
let commandParserInstance: CommandParser | null = null

export function getCommandParser(): CommandParser {
  if (!commandParserInstance) {
    commandParserInstance = new CommandParser()
  }
  return commandParserInstance
}
