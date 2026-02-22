import { createModuleLogger } from './logger.js'
import { sleep } from './utils.js'

const logger = createModuleLogger('retry-utils')

/**
 * Retry options
 */
export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  readonly maxAttempts?: number
  /** Initial delay in ms (default: 1000) */
  readonly initialDelay?: number
  /** Maximum delay in ms (default: 30000) */
  readonly maxDelay?: number
  /** Backoff multiplier (default: 2) */
  readonly backoffFactor?: number
  /** Jitter factor 0-1 (default: 0.1) */
  readonly jitter?: number
  /** Predicate to determine if error is retryable */
  readonly isRetryable?: (error: Error, attempt: number) => boolean
  /** Callback before each retry */
  readonly onRetry?: (error: Error, attempt: number, delay: number) => void
}

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  readonly success: boolean
  readonly result?: T
  readonly error?: Error
  readonly attempts: number
  readonly totalTime: number
}

/**
 * Batch processing result with fault isolation
 */
export interface BatchResult<T, R> {
  readonly successful: Array<{ input: T; result: R }>
  readonly failed: Array<{ input: T; error: Error }>
  readonly totalProcessed: number
  readonly successRate: number
}

/**
 * Circuit breaker states
 */
export type CircuitState = 'closed' | 'open' | 'half-open'

/**
 * Circuit breaker options
 */
export interface CircuitBreakerOptions {
  /** Failure threshold to open circuit (default: 5) */
  readonly failureThreshold?: number
  /** Success threshold to close circuit (default: 3) */
  readonly successThreshold?: number
  /** Time to wait before trying half-open (default: 30000) */
  readonly resetTimeout?: number
  /** Callback when circuit opens */
  readonly onOpen?: () => void
  /** Callback when circuit closes */
  readonly onClose?: () => void
}

/**
 * Execute with exponential backoff retry (Kiro-style)
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
    jitter = 0.1,
    isRetryable,
    onRetry,
  } = options

  let lastError: Error | undefined
  let delay = initialDelay

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Check if error is retryable
      if (isRetryable && !isRetryable(lastError, attempt)) {
        throw lastError
      }

      if (attempt === maxAttempts) {
        break
      }

      // Calculate delay with jitter
      const jitterAmount = delay * jitter * Math.random()
      const actualDelay = Math.min(delay + jitterAmount, maxDelay)

      logger.debug(`Retry attempt ${attempt}/${maxAttempts}`, {
        error: lastError.message,
        delay: actualDelay,
      })

      if (onRetry) {
        onRetry(lastError, attempt, actualDelay)
      }

      await sleep(actualDelay)
      delay = Math.min(delay * backoffFactor, maxDelay)
    }
  }

  throw lastError
}

/**
 * Execute with retry and return detailed result
 */
export async function retryWithResult<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const startTime = Date.now()
  const { maxAttempts = 3 } = options

  let lastError: Error | undefined
  let attempts = 0

  try {
    const result = await retryWithBackoff(
      async () => {
        attempts++
        return fn()
      },
      { ...options, maxAttempts }
    )

    return {
      success: true,
      result,
      attempts,
      totalTime: Date.now() - startTime,
    }
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error))

    return {
      success: false,
      error: lastError,
      attempts,
      totalTime: Date.now() - startTime,
    }
  }
}

/**
 * Process items in batch with fault isolation
 * If one item fails, others continue processing
 */
export async function processBatch<T, R>(
  items: readonly T[],
  processor: (item: T, index: number) => Promise<R>,
  options: {
    /** Batch size (default: 10) */
    readonly batchSize?: number
    /** Continue on error (default: true) */
    readonly continueOnError?: boolean
    /** Callback for each error */
    readonly onError?: (error: Error, item: T, index: number) => void
  } = {}
): Promise<BatchResult<T, R>> {
  const { batchSize = 10, continueOnError = true, onError } = options

  const successful: Array<{ input: T; result: R }> = []
  const failed: Array<{ input: T; error: Error }> = []

  // Process in batches
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)

    const results = await Promise.allSettled(
      batch.map((item, batchIndex) => processor(item, i + batchIndex))
    )

    for (let j = 0; j < results.length; j++) {
      const result = results[j]!
      const item = batch[j]!

      if (result.status === 'fulfilled') {
        successful.push({ input: item, result: result.value })
      } else {
        const error = result.reason instanceof Error ? result.reason : new Error(String(result.reason))
        failed.push({ input: item, error })

        if (onError) {
          onError(error, item, i + j)
        }

        if (!continueOnError) {
          return {
            successful,
            failed,
            totalProcessed: successful.length + failed.length,
            successRate: successful.length / (i + j + 1),
          }
        }
      }
    }
  }

  return {
    successful,
    failed,
    totalProcessed: items.length,
    successRate: successful.length / items.length,
  }
}

/**
 * Circuit breaker for preventing cascading failures
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed'
  private failureCount = 0
  private successCount = 0
  private lastFailureTime = 0

  private readonly failureThreshold: number
  private readonly successThreshold: number
  private readonly resetTimeout: number
  private readonly onOpen
  private readonly onClose

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5
    this.successThreshold = options.successThreshold ?? 3
    this.resetTimeout = options.resetTimeout ?? 30000
    this.onOpen = options.onOpen
    this.onClose = options.onClose
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should transition from open to half-open
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'half-open'
        this.successCount = 0
        logger.info('Circuit breaker transitioning to half-open')
      } else {
        throw new Error('Circuit breaker is open')
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess(): void {
    this.failureCount = 0

    if (this.state === 'half-open') {
      this.successCount++
      if (this.successCount >= this.successThreshold) {
        this.state = 'closed'
        logger.info('Circuit breaker closed')
        if (this.onClose) {
          this.onClose()
        }
      }
    }
  }

  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.state === 'half-open') {
      this.state = 'open'
      logger.warn('Circuit breaker reopened from half-open')
      if (this.onOpen) {
        this.onOpen()
      }
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = 'open'
      logger.warn('Circuit breaker opened', { failureCount: this.failureCount })
      if (this.onOpen) {
        this.onOpen()
      }
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.state = 'closed'
    this.failureCount = 0
    this.successCount = 0
    this.lastFailureTime = 0
    logger.info('Circuit breaker reset')
  }
}

/**
 * Graceful degradation wrapper
 * Tries primary function, falls back to secondary if it fails
 */
export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  options: {
    /** Log fallback usage */
    readonly logFallback?: boolean
    /** Condition to use fallback */
    readonly shouldFallback?: (error: Error) => boolean
  } = {}
): Promise<T> {
  try {
    return await primary()
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))

    if (options.shouldFallback && !options.shouldFallback(err)) {
      throw err
    }

    if (options.logFallback !== false) {
      logger.warn('Using fallback due to primary failure', { error: err.message })
    }

    return fallback()
  }
}

/**
 * Timeout wrapper
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  message = 'Operation timed out'
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
  })

  try {
    const result = await Promise.race([fn(), timeoutPromise])
    clearTimeout(timeoutId!)
    return result
  } catch (error) {
    clearTimeout(timeoutId!)
    throw error
  }
}
