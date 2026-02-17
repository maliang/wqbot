/**
 * Self-Referential Loop - Types
 * 
 * Type definitions for self-referential development loops.
 */

// Re-export from loop-controller
export {
  type LoopConfig,
  type LoopIteration,
  type LoopPhase,
  type IterationStatus,
  type LoopInput,
  type LoopOutput,
  type FileChange,
  type LoopAnalysis,
  type Issue,
  type QualityMetrics,
  type Suggestion,
  type LoopSession,
  type SessionStatus,
  type Improvement,
  type LoopEvent,
  type LoopEventType,
  type LoopAnalyzer,
  type LoopExecutor
} from './loop-controller.js'

export {
  type LearningRecord,
  type Feedback,
  type AdaptationRule,
  type ImprovementStrategy,
  type RalphExConfig,
  type RalphExResult
} from './self-improver.js'

// Configuration for CLI
export interface SelfLoopCLIOptions {
  task: string
  maxIterations?: number
  maxDuration?: number
  noAutoFix?: boolean
  verbose?: boolean
  export?: string
  import?: string
}

// Ralph-Ex specific options
export interface RalphExCLIOptions {
  task: string
  selfReflect?: boolean
  learnFromErrors?: boolean
  autoOptimize?: boolean
  iterations?: number
}

// Loop status output
export interface LoopStatus {
  id: string
  status: SessionStatus
  currentPhase: LoopPhase
  progress: {
    currentIteration: number
    maxIterations: number
    elapsedTime: number
    estimatedRemaining: number
  }
  score: {
    current: number
    previous: number
    change: number
  }
  improvements: {
    applied: number
    pending: number
  }
}

// Built-in loop templates
export const LOOP_TEMPLATES = {
  quick: {
    name: 'Quick Fix',
    description: 'Fast single-pass improvement',
    config: {
      maxIterations: 2,
      maxDuration: 60000,
      convergenceThreshold: 10,
      autoFixEnabled: true,
      approvalRequired: false
    }
  },
  standard: {
    name: 'Standard Improvement',
    description: 'Balanced improvement with verification',
    config: {
      maxIterations: 5,
      maxDuration: 300000,
      convergenceThreshold: 5,
      autoFixEnabled: true,
      approvalRequired: false
    }
  },
  thorough: {
    name: 'Thorough Analysis',
    description: 'Deep analysis with multiple passes',
    config: {
      maxIterations: 10,
      maxDuration: 600000,
      convergenceThreshold: 3,
      autoFixEnabled: true,
      approvalRequired: true
    }
  },
  ralphex: {
    name: 'Ralph-Ex',
    description: 'Self-referential development loop (like ralphex)',
    config: {
      maxIterations: 15,
      maxDuration: 600000,
      convergenceThreshold: 2,
      autoFixEnabled: true,
      approvalRequired: false
    }
  }
} as const
