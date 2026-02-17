/**
 * Self-Referential Loop - Entry Point
 * 
 * Self-improvement and autonomous code optimization.
 */

export {
  SelfLoopController,
  getLoopController,
  createLoopController,
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
  SelfImprover,
  getSelfImprover,
  createSelfImprover,
  runRalphExLoop,
  type LearningRecord,
  type Feedback,
  type AdaptationRule,
  type ImprovementStrategy,
  type RalphExConfig,
  type RalphExResult
} from './self-improver.js'

export {
  type SelfLoopCLIOptions,
  type RalphExCLIOptions,
  type LoopStatus,
  LOOP_TEMPLATES
} from './types.js'

// Convenience function to start a quick improvement loop
export async function quickImprove(task: string): Promise<LoopSession> {
  const { getLoopController } = await import('./loop-controller.js')
  const controller = getLoopController()
  
  return controller.startLoop(
    { task },
    LOOP_TEMPLATES.quick.config
  )
}

// Convenience function to start a Ralph-Ex style loop
export async function startRalphEx(task: string): Promise<RalphExResult> {
  return runRalphExLoop(
    { task },
    LOOP_TEMPLATES.ralphex.config as any
  )
}
