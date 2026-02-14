import pino from 'pino'
import type { Logger as PinoLogger } from 'pino'
import { getConfigManager } from './config.js'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  readonly module?: string | undefined
  readonly conversationId?: string | undefined
  readonly skillName?: string | undefined
  readonly modelId?: string | undefined
  readonly [key: string]: unknown
}

export interface Logger {
  debug(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, error?: Error, context?: LogContext): void
  child(context: LogContext): Logger
}

class PinoLoggerWrapper implements Logger {
  private readonly logger: PinoLogger

  constructor(logger: PinoLogger) {
    this.logger = logger
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(context ?? {}, message)
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(context ?? {}, message)
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(context ?? {}, message)
  }

  error(message: string, error?: Error, context?: LogContext): void {
    const errorContext = error
      ? {
          ...context,
          error: {
            message: error.message,
            name: error.name,
            stack: error.stack,
          },
        }
      : context

    this.logger.error(errorContext ?? {}, message)
  }

  child(context: LogContext): Logger {
    return new PinoLoggerWrapper(this.logger.child(context))
  }
}

let rootLogger: Logger | null = null

export function createLogger(options?: { level?: LogLevel; logFile?: string }): Logger {
  // 获取配置，如果 ConfigManager 尚未初始化则使用默认值
  let config: { logLevel?: LogLevel; logFile?: string | undefined } | null = null
  try {
    const cfg = getConfigManager().getConfig()
    config = { logLevel: cfg.logLevel, logFile: cfg.logFile }
  } catch {
    // ConfigManager 尚未初始化，使用默认值
  }

  const level = options?.level ?? config?.logLevel ?? 'info'
  const logFile = options?.logFile ?? config?.logFile

  const targets: pino.TransportTargetOptions[] = [
    {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
      level,
    },
  ]

  if (logFile) {
    targets.push({
      target: 'pino/file',
      options: { destination: logFile },
      level,
    })
  }

  const transport = pino.transport({ targets })

  const pinoLogger = pino(
    {
      level,
      base: {
        app: 'wqbot',
      },
    },
    transport
  )

  return new PinoLoggerWrapper(pinoLogger)
}

export function getLogger(): Logger {
  if (!rootLogger) {
    rootLogger = createLogger()
  }
  return rootLogger
}

export function initializeLogger(options?: { level?: LogLevel; logFile?: string }): Logger {
  rootLogger = createLogger(options)
  return rootLogger
}

export function createModuleLogger(moduleName: string): Logger {
  // 延迟初始化：避免模块顶层调用时 ConfigManager 尚未定义
  let cached: Logger | null = null
  const getChild = (): Logger => {
    if (!cached) {
      cached = getLogger().child({ module: moduleName })
    }
    return cached
  }
  return {
    debug(message: string, context?: LogContext): void {
      getChild().debug(message, context)
    },
    info(message: string, context?: LogContext): void {
      getChild().info(message, context)
    },
    warn(message: string, context?: LogContext): void {
      getChild().warn(message, context)
    },
    error(message: string, error?: Error, context?: LogContext): void {
      getChild().error(message, error, context)
    },
    child(context: LogContext): Logger {
      return getChild().child(context)
    },
  }
}
