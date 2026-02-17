import { createModuleLogger } from '@wqbot/core'

const logger = createModuleLogger('input-sanitizer')

/**
 * Sanitization result
 */
export interface SanitizationResult {
  readonly isClean: boolean
  readonly sanitizedInput: string
  readonly detectedPatterns: readonly string[]
  readonly wasTruncated: boolean
}

/**
 * Sanitization options
 */
export interface SanitizerOptions {
  /** Maximum input length (default: 100000 for general, 500 for titles) */
  readonly maxLength?: number
  /** Whether to redact or remove dangerous patterns (default: 'redact') */
  readonly mode?: 'redact' | 'remove' | 'throw'
  /** Custom patterns to detect */
  readonly customPatterns?: readonly RegExp[]
}

/**
 * Dangerous patterns for prompt injection prevention
 * Based on Kiro's security implementation
 */
const DANGEROUS_PATTERNS: readonly { pattern: RegExp; name: string }[] = [
  // Instruction override patterns
  {
    pattern: /ignore\s+(all\s+)?(previous|above|prior|earlier)\s+instructions?/gi,
    name: 'instruction-ignore',
  },
  {
    pattern: /disregard\s+(all\s+)?(previous|above|prior|earlier)\s+instructions?/gi,
    name: 'instruction-disregard',
  },
  {
    pattern: /forget\s+(all\s+)?(previous|above|prior|earlier)\s+(instructions?|context)/gi,
    name: 'instruction-forget',
  },
  {
    pattern: /you\s+are\s+now\s+(a|an)\s+\w+\s+that/gi,
    name: 'role-hijack',
  },
  {
    pattern: /system:\s*you\s+are/gi,
    name: 'system-override',
  },
  // Code execution patterns
  {
    pattern: /eval\s*\(/gi,
    name: 'eval-injection',
  },
  {
    pattern: /Function\s*\(/gi,
    name: 'function-injection',
  },
  {
    pattern: /setTimeout\s*\(\s*["'`]/gi,
    name: 'setTimeout-injection',
  },
  {
    pattern: /setInterval\s*\(\s*["'`]/gi,
    name: 'setInterval-injection',
  },
  // Delimiter attacks
  {
    pattern: /---\s*(system|assistant|user|human)\s*---/gi,
    name: 'delimiter-attack',
  },
  {
    pattern: /<<<\s*(system|assistant|user|human)\s*>>>/gi,
    name: 'delimiter-attack-alt',
  },
  // Common jailbreak patterns
  {
    pattern: /do\s+anything\s+now/gi,
    name: 'dan-jailbreak',
  },
  {
    pattern: /developer\s+mode/gi,
    name: 'developer-mode',
  },
  {
    pattern: /jailbreak/gi,
    name: 'explicit-jailbreak',
  },
  // Output manipulation
  {
    pattern: /print\s+(".*"|'.*')\s*;?\s*$/gi,
    name: 'output-manipulation',
  },
  {
    pattern: /respond\s+with\s+(only|exactly):/gi,
    name: 'response-hijack',
  },
]

// Default maximum lengths
const DEFAULT_MAX_LENGTH = 100000 // 100KB
const MAX_TITLE_LENGTH = 500
const MAX_BODY_LENGTH = 10000 // 10KB

/**
 * Input sanitizer for preventing prompt injection attacks
 */
export class InputSanitizer {
  private readonly maxLength: number
  private readonly mode: 'redact' | 'remove' | 'throw'
  private readonly patterns: readonly { pattern: RegExp; name: string }[]

  constructor(options: SanitizerOptions = {}) {
    this.maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH
    this.mode = options.mode ?? 'redact'
    this.patterns = [...DANGEROUS_PATTERNS, ...(options.customPatterns?.map((p, i) => ({
      pattern: p,
      name: `custom-${i}`,
    })) ?? [])]
  }

  /**
   * Sanitize user input
   */
  sanitize(input: string): SanitizationResult {
    const detectedPatterns: string[] = []
    let sanitizedInput = input
    let wasTruncated = false

    // Length validation
    if (sanitizedInput.length > this.maxLength) {
      sanitizedInput = sanitizedInput.slice(0, this.maxLength)
      wasTruncated = true
      logger.warn('Input truncated due to length limit', {
        originalLength: input.length,
        maxLength: this.maxLength,
      })
    }

    // Detect and handle dangerous patterns
    for (const { pattern, name } of this.patterns) {
      if (pattern.test(sanitizedInput)) {
        detectedPatterns.push(name)

        switch (this.mode) {
          case 'redact':
            sanitizedInput = sanitizedInput.replace(pattern, '[REDACTED]')
            break
          case 'remove':
            sanitizedInput = sanitizedInput.replace(pattern, '')
            break
          case 'throw':
            throw new Error(`Potential prompt injection detected: ${name}`)
        }
      }
    }

    if (detectedPatterns.length > 0) {
      logger.warn('Dangerous patterns detected and handled', {
        patterns: detectedPatterns,
        mode: this.mode,
      })
    }

    return {
      isClean: detectedPatterns.length === 0 && !wasTruncated,
      sanitizedInput,
      detectedPatterns,
      wasTruncated,
    }
  }

  /**
   * Sanitize title input (shorter max length)
   */
  sanitizeTitle(title: string): SanitizationResult {
    const sanitizer = new InputSanitizer({
      ...this,
      maxLength: MAX_TITLE_LENGTH,
    })
    return sanitizer.sanitize(title)
  }

  /**
   * Sanitize body/content input
   */
  sanitizeBody(body: string): SanitizationResult {
    const sanitizer = new InputSanitizer({
      ...this,
      maxLength: MAX_BODY_LENGTH,
    })
    return sanitizer.sanitize(body)
  }

  /**
   * Check if input contains dangerous patterns without sanitizing
   */
  check(input: string): { isSafe: boolean; detectedPatterns: string[] } {
    const detectedPatterns: string[] = []

    for (const { pattern, name } of this.patterns) {
      if (pattern.test(input)) {
        detectedPatterns.push(name)
      }
    }

    return {
      isSafe: detectedPatterns.length === 0,
      detectedPatterns,
    }
  }

  /**
   * Get all dangerous pattern names
   */
  getPatternNames(): string[] {
    return this.patterns.map((p) => p.name)
  }
}

// Singleton instance
let sanitizerInstance: InputSanitizer | null = null

/**
 * Get the global sanitizer instance
 */
export function getInputSanitizer(): InputSanitizer {
  if (!sanitizerInstance) {
    sanitizerInstance = new InputSanitizer()
  }
  return sanitizerInstance
}

/**
 * Initialize sanitizer with custom options
 */
export function initializeInputSanitizer(options?: SanitizerOptions): InputSanitizer {
  sanitizerInstance = new InputSanitizer(options)
  return sanitizerInstance
}

/**
 * Convenience function to sanitize input
 */
export function sanitizeInput(input: string, options?: SanitizerOptions): SanitizationResult {
  if (options) {
    return new InputSanitizer(options).sanitize(input)
  }
  return getInputSanitizer().sanitize(input)
}

/**
 * Convenience function to check input safety
 */
export function checkInputSafety(input: string): { isSafe: boolean; detectedPatterns: string[] } {
  return getInputSanitizer().check(input)
}
