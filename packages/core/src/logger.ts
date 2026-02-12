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
  const config = getConfigManager().getConfig()
  const level = options?.level ?? config.logLevel
  const logFile = options?.logFile ?? config.logFile

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
  return getLogger().child({ module: moduleName })
}
