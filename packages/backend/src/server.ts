import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import { createModuleLogger } from '@wqbot/core'
import { chatRoutes } from './routes/chat.js'
import { configRoutes } from './routes/config.js'
import { skillsRoutes } from './routes/skills.js'
import { settingsRoutes } from './routes/settings.js'
import { tasksRoutes } from './routes/tasks.js'
import { snapshotRoutes } from './routes/snapshot.js'
import { openaiRoutes } from './routes/openai.js'
import { knowledgeRoutes } from './routes/knowledge.js'
import { initializeSSE, getSSEManager } from './sse.js'

const logger = createModuleLogger('backend')

export interface ServerOptions {
  host?: string
  port?: number
  cors?: boolean
}

const DEFAULT_OPTIONS: Required<ServerOptions> = {
  host: '0.0.0.0',
  port: 3721,
  cors: true,
}

let serverInstance: FastifyInstance | null = null

export async function createServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  const fastify = Fastify({
    logger: false, // 使用自定义 logger
  })

  // 初始化 SSE 管理器
  initializeSSE()

  // CORS 支持
  if (opts.cors) {
    await fastify.register(cors, {
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    })
  }

  // 请求日志
  fastify.addHook('onRequest', async (request) => {
    logger.debug(`${request.method} ${request.url}`)
  })

  // 错误处理
  fastify.setErrorHandler((error, _request, reply) => {
    logger.error('请求错误:', error)
    reply.status(500).send({
      success: false,
      error: error.message || '服务器内部错误',
    })
  })

  // 健康检查
  fastify.get('/api/health', async () => {
    return {
      success: true,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        connections: getSSEManager().getConnectionCount(),
      },
    }
  })

  // 注册路由
  await fastify.register(chatRoutes)
  await fastify.register(configRoutes)
  await fastify.register(skillsRoutes)
  await fastify.register(settingsRoutes)
  await fastify.register(tasksRoutes)
  await fastify.register(snapshotRoutes)
  await fastify.register(openaiRoutes)
  await fastify.register(knowledgeRoutes)

  return fastify
}

export async function startServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  if (serverInstance) {
    logger.warn('服务器已在运行')
    return serverInstance
  }

  const fastify = await createServer(opts)

  try {
    await fastify.listen({ host: opts.host, port: opts.port })
    serverInstance = fastify

    logger.info(`WQBot 后端服务已启动: http://${opts.host}:${opts.port}`)
    console.log(`\n🚀 WQBot 后端服务已启动`)
    console.log(`   地址: http://${opts.host}:${opts.port}`)
    console.log(`   健康检查: http://${opts.host}:${opts.port}/api/health\n`)

    return fastify
  } catch (error) {
    logger.error('启动服务器失败:', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

export async function stopServer(): Promise<void> {
  if (!serverInstance) {
    return
  }

  try {
    // 关闭所有 SSE 连接
    getSSEManager().closeAll()

    await serverInstance.close()
    serverInstance = null
    logger.info('服务器已停止')
  } catch (error) {
    logger.error('停止服务器失败:', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

export function getServer(): FastifyInstance | null {
  return serverInstance
}
