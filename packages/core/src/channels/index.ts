/**
 * Channels - Multi-platform Message Integration
 * 
 * Supports Telegram, Slack, WhatsApp, Discord, and other messaging platforms.
 */

import { createModuleLogger } from '../logger'
import { EventEmitter } from 'events'

const logger = createModuleLogger('channels')

// ============================================================================
// Types
// ============================================================================

export interface ChannelConfig {
  enabled: boolean
  platform: ChannelPlatform
  credentials: ChannelCredentials
  settings?: ChannelSettings
}

export type ChannelPlatform = 'telegram' | 'slack' | 'whatsapp' | 'discord' | 'webhook'

export interface ChannelCredentials {
  // Common
  botToken?: string
  apiKey?: string
  
  // Telegram
  telegramBotToken?: string
  telegramChatId?: string
  
  // Slack
  slackBotToken?: string
  slackSigningSecret?: string
  slackAppToken?: string
  
  // WhatsApp
  whatsappPhoneNumberId?: string
  whatsappAccessToken?: string
  whatsappBusinessAccountId?: string
  
  // Discord
  discordBotToken?: string
  discordGuildId?: string
  
  // Webhook
  webhookUrl?: string
  webhookSecret?: string
}

export interface ChannelSettings {
  prefix?: string           // Command prefix
  allowCommands?: boolean   // Allow bot commands
  maxMessageLength?: number
  typingIndicator?: boolean
  readReceipts?: boolean
}

export interface InboundMessage {
  id: string
  platform: ChannelPlatform
  chatId: string
  userId: string
  userName?: string
  content: string
  timestamp: Date
  raw?: unknown
}

export interface OutboundMessage {
  chatId: string
  content: string
  options?: {
    parseMode?: 'markdown' | 'html'
    replyTo?: string
    attachments?: MessageAttachment[]
  }
}

export interface MessageAttachment {
  type: 'image' | 'video' | 'audio' | 'file' | 'sticker'
  url?: string
  fileId?: string
  caption?: string
}

export interface ChannelEvent {
  type: ChannelEventType
  platform: ChannelPlatform
  message?: InboundMessage
  error?: Error
  timestamp: Date
}

export type ChannelEventType = 
  | 'message:received'
  | 'message:sent'
  | 'message:error'
  | 'command:received'
  | 'callback:query'
  | 'channel:connected'
  | 'channel:disconnected'

// ============================================================================
// Base Channel Adapter
// ============================================================================

export abstract class ChannelAdapter {
  protected config: ChannelConfig
  protected emitter: EventEmitter
  protected connected = false

  constructor(config: ChannelConfig) {
    this.config = config
    this.emitter = new EventEmitter()
  }

  abstract connect(): Promise<void>
  abstract disconnect(): Promise<void>
  abstract sendMessage(message: OutboundMessage): Promise<string>
  abstract getMe(): Promise<ChannelUser>

  on(event: ChannelEventType, handler: (event: ChannelEvent) => void): void {
    this.emitter.on(event, handler)
  }

  off(event: ChannelEventType, handler: (event: ChannelEvent) => void): void {
    this.emitter.off(event, handler)
  }

  protected emit(event: Omit<ChannelEvent, 'timestamp' | 'platform'>): void {
    this.emitter.emit(event.type, {
      ...event,
      platform: this.config.platform,
      timestamp: new Date()
    })
  }

  get isConnected(): boolean {
    return this.connected
  }
}

export interface ChannelUser {
  id: string
  name: string
  username?: string
}

// ============================================================================
// Telegram Adapter
// ============================================================================

export class TelegramAdapter extends ChannelAdapter {
  private baseUrl = 'https://api.telegram.org'

  constructor(config: ChannelConfig) {
    super(config)
  }

  async connect(): Promise<void> {
    const token = this.config.credentials.telegramBotToken
    if (!token) {
      throw new Error('Telegram bot token is required')
    }

    try {
      const me = await this.getMe()
      logger.info(`Connected to Telegram as @${me.username}`)
      this.connected = true
      this.emit({ type: 'channel:connected' })
    } catch (error) {
      logger.error('Failed to connect to Telegram', error as Error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false
    this.emit({ type: 'channel:disconnected' })
    logger.info('Disconnected from Telegram')
  }

  async sendMessage(message: OutboundMessage): Promise<string> {
    const token = this.config.credentials.telegramBotToken!
    
    const response = await fetch(`${this.baseUrl}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: message.chatId,
        text: message.content,
        parse_mode: message.options?.parseMode === 'markdown' ? 'MarkdownV2' : undefined,
        reply_to_message_id: message.options?.replyTo
      })
    })

    const data = await response.json() as { ok: boolean; result?: { message_id: number } }
    
    if (!data.ok) {
      throw new Error(`Telegram API error: ${JSON.stringify(data)}`)
    }

    return String(data.result?.message_id)
  }

  async getMe(): Promise<ChannelUser> {
    const token = this.config.credentials.telegramBotToken!
    
    const response = await fetch(`${this.baseUrl}/bot${token}/getMe`)
    const data = await response.json() as { ok: boolean; result?: { id: number; username: string; first_name: string } }
    
    if (!data.ok || !data.result) {
      throw new Error('Failed to get Telegram bot info')
    }

    return {
      id: String(data.result.id),
      name: data.result.first_name,
      username: data.result.username
    }
  }

  // Handle incoming updates
  async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (update.message) {
      const message: InboundMessage = {
        id: String(update.message.message_id),
        platform: 'telegram',
        chatId: String(update.message.chat.id),
        userId: String(update.message.from?.id),
        userName: update.message.from?.first_name,
        content: update.message.text || '',
        timestamp: new Date(update.message.date * 1000),
        raw: update
      }
      this.emit({ type: 'message:received', message })
    }
  }
}

interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from?: { id: number; first_name: string }
    chat: { id: number }
    text?: string
    date: number
  }
  callback_query?: {
    id: string
    from: { id: number; first_name: string }
    message?: { chat: { id: number }; message_id: number }
    data: string
  }
}

// ============================================================================
// Slack Adapter
// ============================================================================

export class SlackAdapter extends ChannelAdapter {
  constructor(config: ChannelConfig) {
    super(config)
  }

  async connect(): Promise<void> {
    const token = this.config.credentials.slackBotToken
    if (!token) {
      throw new Error('Slack bot token is required')
    }

    try {
      const me = await this.getMe()
      logger.info(`Connected to Slack as ${me.name}`)
      this.connected = true
      this.emit({ type: 'channel:connected' })
    } catch (error) {
      logger.error('Failed to connect to Slack', error as Error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false
    this.emit({ type: 'channel:disconnected' })
  }

  async sendMessage(message: OutboundMessage): Promise<string> {
    const token = this.config.credentials.slackBotToken!
    
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        channel: message.chatId,
        text: message.content,
        mrkdwn: message.options?.parseMode === 'markdown'
      })
    })

    const data = await response.json() as { ok: boolean; ts?: string }
    
    if (!data.ok) {
      throw new Error(`Slack API error: ${JSON.stringify(data)}`)
    }

    return data.ts!
  }

  async getMe(): Promise<ChannelUser> {
    const token = this.config.credentials.slackBotToken!
    
    const response = await fetch('https://slack.com/api/auth.test', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    
    const data = await response.json() as { ok: boolean; user_id?: string; user?: string }
    
    if (!data.ok) {
      throw new Error('Failed to get Slack bot info')
    }

    return {
      id: data.user_id!,
      name: data.user!
    }
  }
}

// ============================================================================
// WhatsApp Adapter (Meta Cloud API)
// ============================================================================

export class WhatsAppAdapter extends ChannelAdapter {
  private apiUrl = 'https://graph.facebook.com/v18.0'

  constructor(config: ChannelConfig) {
    super(config)
  }

  async connect(): Promise<void> {
    const { whatsappPhoneNumberId, whatsappAccessToken } = this.config.credentials
    
    if (!whatsappPhoneNumberId || !whatsappAccessToken) {
      throw new Error('WhatsApp phone number ID and access token are required')
    }

    try {
      // Verify credentials by getting phone number info
      const response = await fetch(
        `${this.apiUrl}/${whatsappPhoneNumberId}?fields=id,verified_name`,
        {
          headers: { 'Authorization': `Bearer ${whatsappAccessToken}` }
        }
      )

      if (!response.ok) {
        throw new Error('Failed to verify WhatsApp credentials')
      }

      logger.info('Connected to WhatsApp')
      this.connected = true
      this.emit({ type: 'channel:connected' })
    } catch (error) {
      logger.error('Failed to connect to WhatsApp', error as Error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false
    this.emit({ type: 'channel:disconnected' })
  }

  async sendMessage(message: OutboundMessage): Promise<string> {
    const { whatsappPhoneNumberId, whatsappAccessToken } = this.config.credentials
    
    const response = await fetch(`${this.apiUrl}/${whatsappPhoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${whatsappAccessToken}`
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: message.chatId,
        type: 'text',
        text: { body: message.content }
      })
    })

    const data = await response.json() as { messages?: { id: string }[]; error?: { message: string } }
    
    if (data.error) {
      throw new Error(`WhatsApp API error: ${data.error.message}`)
    }

    return data.messages?.[0]?.id || ''
  }

  async getMe(): Promise<ChannelUser> {
    const { whatsappPhoneNumberId, whatsappAccessToken } = this.config.credentials
    
    const response = await fetch(
      `${this.apiUrl}/${whatsappPhoneNumberId}?fields=id,verified_name`,
      {
        headers: { 'Authorization': `Bearer ${whatsappAccessToken}` }
      }
    )

    const data = await response.json() as { id: string; verified_name: string }
    
    return {
      id: data.id,
      name: data.verified_name
    }
  }

  // Handle incoming webhook
  async handleWebhook(payload: WhatsAppWebhookPayload): Promise<void> {
    const entry = payload.entry?.[0]
    const changes = entry?.changes?.[0]
    const message = changes?.value?.messages?.[0]

    if (message) {
      const inbound: InboundMessage = {
        id: message.id?.id || String(Date.now()),
        platform: 'whatsapp',
        chatId: message.from,
        userId: message.from,
        content: message.text?.body || '',
        timestamp: new Date(message.timestamp ? message.timestamp * 1000 : Date.now()),
        raw: payload
      }
      this.emit({ type: 'message:received', message: inbound })
    }
  }
}

interface WhatsAppWebhookPayload {
  object: string
  entry?: Array<{
    id: string
    changes?: Array<{
      value: {
        messages?: Array<{
          id?: { id: string }
          from: string
          text?: { body: string }
          timestamp: string
        }>
      }
    }>
  }>
}

// ============================================================================
// Discord Adapter
// ============================================================================

export class DiscordAdapter extends ChannelAdapter {
  private baseUrl = 'https://discord.com/api/v10'

  constructor(config: ChannelConfig) {
    super(config)
  }

  async connect(): Promise<void> {
    const token = this.config.credentials.discordBotToken
    if (!token) {
      throw new Error('Discord bot token is required')
    }

    try {
      const me = await this.getMe()
      logger.info(`Connected to Discord as ${me.name}`)
      this.connected = true
      this.emit({ type: 'channel:connected' })
    } catch (error) {
      logger.error('Failed to connect to Discord', error as Error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false
    this.emit({ type: 'channel:disconnected' })
  }

  async sendMessage(message: OutboundMessage): Promise<string> {
    const token = this.config.credentials.discordBotToken!
    
    const response = await fetch(`${this.baseUrl}/channels/${message.chatId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bot ${token}`
      },
      body: JSON.stringify({
        content: message.content
      })
    })

    const data = await response.json() as { id?: string; message?: string }
    
    if (!data.id) {
      throw new Error(`Discord API error: ${data.message || 'Unknown error'}`)
    }

    return data.id
  }

  async getMe(): Promise<ChannelUser> {
    const token = this.config.credentials.discordBotToken!
    
    const response = await fetch(`${this.baseUrl}/users/@me`, {
      headers: { 'Authorization': `Bot ${token}` }
    })
    
    const data = await response.json() as { id: string; username: string }
    
    return {
      id: data.id,
      name: data.username
    }
  }
}

// ============================================================================
// Webhook Receiver
// ============================================================================

export class WebhookAdapter extends ChannelAdapter {
  constructor(config: ChannelConfig) {
    super(config)
  }

  async connect(): Promise<void> {
    // Webhook doesn't need connection - it's receive-only
    this.connected = true
    this.emit({ type: 'channel:connected' })
    logger.info('Webhook adapter ready')
  }

  async disconnect(): Promise<void> {
    this.connected = false
    this.emit({ type: 'channel:disconnected' })
  }

  async sendMessage(message: OutboundMessage): Promise<string> {
    const webhookUrl = this.config.credentials.webhookUrl
    if (!webhookUrl) {
      throw new Error('Webhook URL is required')
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message.content })
    })

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`)
    }

    return 'sent'
  }

  async getMe(): Promise<ChannelUser> {
    return {
      id: 'webhook',
      name: 'Webhook'
    }
  }

  // Handle incoming webhook request
  handleWebhookRequest(body: unknown): void {
    const message: InboundMessage = {
      id: String(Date.now()),
      platform: 'webhook',
      chatId: 'webhook',
      userId: 'webhook',
      content: JSON.stringify(body),
      timestamp: new Date(),
      raw: body
    }
    this.emit({ type: 'message:received', message })
  }
}

// ============================================================================
// Channel Manager
// ============================================================================

export class ChannelManager {
  private channels: Map<ChannelPlatform, ChannelAdapter> = new Map()
  private emitter: EventEmitter

  constructor() {
    this.emitter = new EventEmitter()
  }

  /**
   * Create and register a channel adapter
   */
  async registerChannel(config: ChannelConfig): Promise<ChannelAdapter> {
    if (!config.enabled) {
      throw new Error('Channel is not enabled')
    }

    const adapter = this.createAdapter(config)
    await adapter.connect()
    
    this.channels.set(config.platform, adapter)
    
    // Forward events
    adapter.on('message:received', (event) => {
      this.emitter.emit('message:received', event)
    })

    logger.info(`Registered channel: ${config.platform}`)
    return adapter
  }

  /**
   * Create adapter based on platform
   */
  private createAdapter(config: ChannelConfig): ChannelAdapter {
    switch (config.platform) {
      case 'telegram':
        return new TelegramAdapter(config)
      case 'slack':
        return new SlackAdapter(config)
      case 'whatsapp':
        return new WhatsAppAdapter(config)
      case 'discord':
        return new DiscordAdapter(config)
      case 'webhook':
        return new WebhookAdapter(config)
      default:
        throw new Error(`Unsupported platform: ${config.platform}`)
    }
  }

  /**
   * Get channel adapter
   */
  getChannel(platform: ChannelPlatform): ChannelAdapter | undefined {
    return this.channels.get(platform)
  }

  /**
   * Get all channels
   */
  getAllChannels(): ChannelAdapter[] {
    return Array.from(this.channels.values())
  }

  /**
   * Disconnect all channels
   */
  async disconnectAll(): Promise<void> {
    for (const channel of this.channels.values()) {
      await channel.disconnect()
    }
    this.channels.clear()
  }

  /**
   * Send message to a specific platform
   */
  async sendMessage(platform: ChannelPlatform, message: OutboundMessage): Promise<string> {
    const channel = this.channels.get(platform)
    if (!channel) {
      throw new Error(`Channel not registered: ${platform}`)
    }
    return channel.sendMessage(message)
  }

  /**
   * Broadcast to all channels
   */
  async broadcast(message: OutboundMessage): Promise<Map<ChannelPlatform, string>> {
    const results = new Map<ChannelPlatform, string>()
    
    for (const [platform, channel] of this.channels) {
      try {
        const id = await channel.sendMessage(message)
        results.set(platform, id)
      } catch (error) {
        logger.error(`Failed to send to ${platform}`, error as Error)
      }
    }

    return results
  }

  /**
   * Subscribe to messages from all channels
   */
  onMessage(handler: (event: ChannelEvent) => void): void {
    this.emitter.on('message:received', handler)
  }

  /**
   * Unsubscribe from messages
   */
  offMessage(handler: (event: ChannelEvent) => void): void {
    this.emitter.off('message:received', handler)
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createChannelManager(): ChannelManager {
  return new ChannelManager()
}

let channelManagerInstance: ChannelManager | null = null

export function getChannelManager(): ChannelManager {
  if (!channelManagerInstance) {
    channelManagerInstance = new ChannelManager()
  }
  return channelManagerInstance
}
