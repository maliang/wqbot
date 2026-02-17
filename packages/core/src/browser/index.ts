/**
 * Browser Automation Module
 * 
 * Provides Playwright-based browser automation for web scraping,
 * testing, and autonomous web interactions.
 */

import { createModuleLogger } from '@wqbot/logger'
import { EventEmitter } from 'events'

const logger = createModuleLogger('browser')

// ============================================================================
// Types
// ============================================================================

export interface BrowserConfig {
  headless?: boolean
  viewport?: ViewportConfig
  userAgent?: string
  timeout?: number
  slowMo?: number
  proxies?: ProxyConfig[]
}

export interface ViewportConfig {
  width: number
  height: number
}

export interface ProxyConfig {
  server: string
  username?: string
  password?: string
}

export interface NavigateOptions {
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit'
  timeout?: number
}

export interface ClickOptions {
  button?: 'left' | 'right' | 'middle'
  clickCount?: number
  delay?: number
  timeout?: number
}

export interface FillOptions {
  timeout?: number
}

export interface ScreenshotOptions {
  type?: 'png' | 'jpeg' | 'webp'
  quality?: number
  fullPage?: boolean
}

export interface EvaluationOptions {
  timeout?: number
}

export interface BrowserPage {
  id: string
  url: string
  title: string
  createdAt: Date
}

export interface BrowserContext {
  id: string
  pages: BrowserPage[]
  createdAt: Date
}

export interface ElementInfo {
  tagName: string
  textContent?: string
  attributes: Record<string, string>
  boundingBox?: BoundingBox
  isVisible: boolean
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface ConsoleMessage {
  type: 'log' | 'warning' | 'error' | 'debug' | 'info'
  text: string
  location: {
    url: string
    line: number
    column: number
  }
}

export interface NetworkRequest {
  id: string
  url: string
  method: string
  responseStatus?: number
  responseMimeType?: string
  postData?: string
}

export interface BrowserEvent {
  type: BrowserEventType
  contextId?: string
  pageId?: string
  data?: unknown
  timestamp: Date
}

export type BrowserEventType = 
  | 'browser:launched'
  | 'browser:closed'
  | 'page:created'
  | 'page:closed'
  | 'page:navigated'
  | 'console:message'
  | 'network:request'
  | 'network:response'

// ============================================================================
// Browser Manager
// ============================================================================

// Note: In a real implementation, this would import playwright
// For now, we provide the interface and a mock implementation

export class BrowserManager {
  private contexts: Map<string, BrowserContext> = new Map()
  private pages: Map<string, unknown> = new Map() // Playwright page objects
  private emitter: EventEmitter
  private browser: unknown = null // Playwright browser instance
  private config: BrowserConfig

  constructor(config?: BrowserConfig) {
    this.config = {
      headless: config?.headless ?? true,
      viewport: config?.viewport ?? { width: 1280, height: 720 },
      timeout: config?.timeout ?? 30000,
      ...config
    }
    this.emitter = new EventEmitter()
  }

  /**
   * Launch browser instance
   */
  async launch(): Promise<void> {
    // In production, this would be:
    // const { chromium } = require('playwright')
    // this.browser = await chromium.launch({ headless: this.config.headless })
    
    logger.info('Browser launch requested', { config: this.config })
    this.emit({ type: 'browser:launched' })
  }

  /**
   * Close browser instance
   */
  async close(): Promise<void> {
    for (const [id] of this.contexts) {
      await this.closeContext(id)
    }
    
    // In production:
    // if (this.browser) await this.browser.close()
    
    this.browser = null
    this.emit({ type: 'browser:closed' })
    logger.info('Browser closed')
  }

  /**
   * Create a new browser context
   */
  async createContext(options?: {
    id?: string
    viewport?: ViewportConfig
    userAgent?: string
  }): Promise<string> {
    const contextId = options?.id || `context-${Date.now()}`
    
    const context: BrowserContext = {
      id: contextId,
      pages: [],
      createdAt: new Date()
    }

    this.contexts.set(contextId, context)
    
    // In production:
    // const context = await this.browser.newContext({
    //   viewport: options?.viewport || this.config.viewport,
    //   userAgent: options?.userAgent || this.config.userAgent
    // })
    
    logger.info('Browser context created', { contextId })
    return contextId
  }

  /**
   * Close a browser context
   */
  async closeContext(contextId: string): Promise<boolean> {
    const context = this.contexts.get(contextId)
    if (!context) return false

    // Close all pages in context
    for (const page of context.pages) {
      await this.closePage(page.id)
    }

    this.contexts.delete(contextId)
    
    // In production:
    // await context.close()
    
    logger.info('Browser context closed', { contextId })
    return true
  }

  /**
   * Create a new page in a context
   */
  async createPage(contextId: string): Promise<string> {
    const context = this.contexts.get(contextId)
    if (!context) {
      throw new Error(`Context not found: ${contextId}`)
    }

    const pageId = `page-${Date.now()}`
    
    const page: BrowserPage = {
      id: pageId,
      url: 'about:blank',
      title: '',
      createdAt: new Date()
    }

    context.pages.push(page)
    this.pages.set(pageId, null) // Placeholder for Playwright page

    this.emit({ type: 'page:created', contextId, pageId })
    logger.info('Page created', { contextId, pageId })
    
    return pageId
  }

  /**
   * Close a page
   */
  async closePage(pageId: string): Promise<boolean> {
    for (const [contextId, context] of this.contexts) {
      const pageIndex = context.pages.findIndex(p => p.id === pageId)
      if (pageIndex !== -1) {
        context.pages.splice(pageIndex, 1)
        this.pages.delete(pageId)
        
        this.emit({ type: 'page:closed', contextId, pageId })
        logger.info('Page closed', { pageId })
        return true
      }
    }
    return false
  }

  /**
   * Navigate to URL
   */
  async navigate(pageId: string, url: string, options?: NavigateOptions): Promise<void> {
    const context = this.findContextByPage(pageId)
    if (!context) {
      throw new Error(`Page not found: ${pageId}`)
    }

    // In production:
    // const page = this.pages.get(pageId)
    // await page.goto(url, { 
    //   waitUntil: options?.waitUntil || 'load',
    //   timeout: options?.timeout || this.config.timeout 
    // })

    // Update page info
    const page = context.pages.find(p => p.id === pageId)
    if (page) {
      page.url = url
    }

    this.emit({ type: 'page:navigated', contextId: context.id, pageId, data: { url } })
    logger.info('Navigated', { pageId, url })
  }

  /**
   * Get page content
   */
  async getContent(pageId: string): Promise<string> {
    // In production:
    // const page = this.pages.get(pageId)
    // return await page.content()
    
    return '<html>Mock content</html>'
  }

  /**
   * Get page title
   */
  async getTitle(pageId: string): Promise<string> {
    const context = this.findContextByPage(pageId)
    const page = context?.pages.find(p => p.id === pageId)
    return page?.title || ''
  }

  /**
   * Click element
   */
  async click(pageId: string, selector: string, options?: ClickOptions): Promise<void> {
    // In production:
    // const page = this.pages.get(pageId)
    // await page.click(selector, { 
    //   button: options?.button,
    //   clickCount: options?.clickCount,
    //   delay: options?.delay,
    //   timeout: options?.timeout || this.config.timeout 
    // })
    
    logger.debug('Click', { pageId, selector, options })
  }

  /**
   * Fill input field
   */
  async fill(pageId: string, selector: string, value: string, options?: FillOptions): Promise<void> {
    // In production:
    // const page = this.pages.get(pageId)
    // await page.fill(selector, value, { 
    //   timeout: options?.timeout || this.config.timeout 
    // })
    
    logger.debug('Fill', { pageId, selector, value })
  }

  /**
   * Type text
   */
  async type(pageId: string, selector: string, text: string, options?: { delay?: number }): Promise<void> {
    // In production:
    // const page = this.pages.get(pageId)
    // await page.type(selector, text, { delay: options?.delay })
    
    logger.debug('Type', { pageId, selector, text })
  }

  /**
   * Press key
   */
  async press(pageId: string, selector: string, key: string): Promise<void> {
    // In production:
    // const page = this.pages.get(pageId)
    // await page.press(selector, key)
    
    logger.debug('Press', { pageId, selector, key })
  }

  /**
   * Select option(s)
   */
  async selectOption(pageId: string, selector: string, values: string | string[]): Promise<string[]> {
    // In production:
    // const page = this.pages.get(pageId)
    // return await page.selectOption(selector, values)
    
    return []
  }

  /**
   * Take screenshot
   */
  async screenshot(pageId: string, options?: ScreenshotOptions): Promise<Buffer> {
    // In production:
    // const page = this.pages.get(pageId)
    // return await page.screenshot({ 
    //   type: options?.type || 'png',
    //   quality: options?.quality,
    //   fullPage: options?.fullPage 
    // })
    
    return Buffer.from('')
  }

  /**
   * Get element info
   */
  async getElement(pageId: string, selector: string): Promise<ElementInfo | null> {
    // In production:
    // const page = this.pages.get(pageId)
    // const element = await page.$(selector)
    // if (!element) return null
    // 
    // const boundingBox = await element.boundingBox()
    // const attributes = await element.evaluate(el => {
    //   const attrs: Record<string, string> = {}
    //   for (const attr of el.attributes) {
    //     attrs[attr.name] = attr.value
    //   }
    //   return attrs
    // })
    // 
    // return {
    //   tagName: await element.evaluate(el => el.tagName),
    //   textContent: await element.textContent(),
    //   attributes,
    //   boundingBox: boundingBox || undefined,
    //   isVisible: await element.isVisible()
    // }
    
    return null
  }

  /**
   * Evaluate JavaScript in page context
   */
  async evaluate<T = unknown>(pageId: string, fn: string | ((...args: unknown[]) => T), ...args: unknown[]): Promise<T> {
    // In production:
    // const page = this.pages.get(pageId)
    // return await page.evaluate(fn, ...args)
    
    return {} as T
  }

  /**
   * Wait for selector
   */
  async waitForSelector(pageId: string, selector: string, options?: { state?: 'visible' | 'hidden' | 'attached'; timeout?: number }): Promise<void> {
    // In production:
    // const page = this.pages.get(pageId)
    // await page.waitForSelector(selector, { 
    //   state: options?.state || 'visible',
    //   timeout: options?.timeout || this.config.timeout 
    // })
    
    logger.debug('Wait for selector', { pageId, selector, options })
  }

  /**
   * Wait for navigation
   */
  async waitForNavigation(pageId: string, options?: NavigateOptions): Promise<void> {
    // In production:
    // const page = this.pages.get(pageId)
    // await page.waitForLoadState(options?.waitUntil || 'load')
    
    logger.debug('Wait for navigation', { pageId })
  }

  /**
   * Get console messages
   */
  async getConsoleMessages(pageId: string): Promise<ConsoleMessage[]> {
    // In production, this would track console messages
    return []
  }

  /**
   * Get network requests
   */
  async getNetworkRequests(pageId: string): Promise<NetworkRequest[]> {
    // In production, this would track network requests
    return []
  }

  /**
   * Find context by page ID
   */
  private findContextByPage(pageId: string): BrowserContext | undefined {
    for (const context of this.contexts.values()) {
      if (context.pages.some(p => p.id === pageId)) {
        return context
      }
    }
    return undefined
  }

  /**
   * Subscribe to browser events
   */
  on(event: BrowserEventType, handler: (event: BrowserEvent) => void): void {
    this.emitter.on(event, handler)
  }

  /**
   * Unsubscribe from browser events
   */
  off(event: BrowserEventType, handler: (event: BrowserEvent) => void): void {
    this.emitter.off(event, handler)
  }

  /**
   * Emit event
   */
  private emit(event: Omit<BrowserEvent, 'timestamp'>): void {
    this.emitter.emit(event.type, {
      ...event,
      timestamp: new Date()
    })
  }

  /**
   * Get statistics
   */
  getStats(): {
    contexts: number
    pages: number
    isRunning: boolean
  } {
    let totalPages = 0
    for (const context of this.contexts.values()) {
      totalPages += context.pages.length
    }

    return {
      contexts: this.contexts.size,
      pages: totalPages,
      isRunning: this.browser !== null
    }
  }
}

// ============================================================================
// Semantic Snapshot (OpenCLAW-style)
// ============================================================================

export interface SemanticSnapshot {
  url: string
  timestamp: Date
  title: string
  interactiveElements: InteractiveElement[]
  forms: FormInfo[]
  navigation: NavigationInfo[]
}

export interface InteractiveElement {
  type: 'button' | 'link' | 'input' | 'select' | 'checkbox' | 'radio'
  role?: string
  label?: string
  text?: string
  href?: string
  id?: string
  name?: string
  selector: string
}

export interface FormInfo {
  id?: string
  action?: string
  method?: string
  fields: FormField[]
}

export interface FormField {
  name: string
  type: string
  label?: string
  required?: boolean
  selector: string
}

export interface NavigationInfo {
  links: { text: string; href: string }[]
  currentPath: string
}

export class SemanticSnapshot {
  /**
   * Create semantic snapshot of a page
   */
  static async capture(pageId: string, browser: BrowserManager): Promise<SemanticSnapshot> {
    const url = await browser.evaluate(pageId, () => window.location.href)
    const title = await browser.getTitle(pageId)

    // Extract interactive elements
    const interactiveElements = await browser.evaluate<InteractiveElement[]>(pageId, () => {
      const elements: InteractiveElement[] = []
      
      // Buttons and links
      document.querySelectorAll('button, a, input, select, [role="button"], [role="link"]').forEach(el => {
        const tag = el.tagName.toLowerCase()
        const role = el.getAttribute('role')
        
        elements.push({
          type: tag === 'a' ? 'link' : tag === 'select' ? 'select' : 
                tag === 'input' ? (el as HTMLInputElement).type as any : 'button',
          role: role || undefined,
          label: (el as HTMLElement).innerText?.trim() || el.getAttribute('aria-label') || undefined,
          text: (el as HTMLElement).innerText?.trim() || undefined,
          href: tag === 'a' ? el.getAttribute('href') || undefined : undefined,
          id: el.id || undefined,
          name: (el as HTMLInputElement).name || undefined,
          selector: '' // Would be generated
        })
      })
      
      return elements
    })

    // Extract forms
    const forms = await browser.evaluate<FormInfo[]>(pageId, () => {
      const forms: FormInfo[] = []
      
      document.querySelectorAll('form').forEach(form => {
        const fields: FormField[] = []
        
        form.querySelectorAll('input, select, textarea').forEach(field => {
          const tag = field.tagName.toLowerCase()
          fields.push({
            name: (field as HTMLInputElement).name,
            type: tag === 'input' ? (field as HTMLInputElement).type : tag,
            label: field.id ? document.querySelector(`label[for="${field.id}"]`)?.innerText : undefined,
            required: field.hasAttribute('required'),
            selector: '' // Would be generated
          })
        })
        
        forms.push({
          id: form.id || undefined,
          action: form.action || undefined,
          method: form.method || undefined,
          fields
        })
      })
      
      return forms
    })

    // Navigation info
    const navigation = await browser.evaluate<NavigationInfo>(pageId, () => {
      const links: { text: string; href: string }[] = []
      
      document.querySelectorAll('a[href]').forEach(link => {
        const href = link.getAttribute('href')
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          links.push({
            text: (link as HTMLElement).innerText?.trim() || '',
            href
          })
        }
      })
      
      return {
        links,
        currentPath: window.location.pathname
      }
    })

    return {
      url,
      timestamp: new Date(),
      title,
      interactiveElements,
      forms,
      navigation
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createBrowserManager(config?: BrowserConfig): BrowserManager {
  return new BrowserManager(config)
}

let browserManagerInstance: BrowserManager | null = null

export function getBrowserManager(): BrowserManager {
  if (!browserManagerInstance) {
    browserManagerInstance = new BrowserManager()
  }
  return browserManagerInstance
}
