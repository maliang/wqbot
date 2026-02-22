import { createModuleLogger } from './logger.js'

const logger = createModuleLogger('orchestrator')

/**
 * Task intent types
 */
export type IntentType =
  | 'simple_qa'          // 简单问答
  | 'code_explanation'    // 代码解释
  | 'code_generation'    // 代码生成
  | 'code_modification'  // 代码修改
  | 'bug_fix'            // Bug 修复
  | 'refactoring'        // 重构
  | 'code_review'        // 代码审查
  | 'testing'            // 测试相关
  | 'documentation'      // 文档相关
  | 'project_setup'      // 项目初始化
  | 'multi_step'         // 多步骤复杂任务
  | 'exploration'        // 代码探索/搜索
  | 'unknown'            // 未知

/**
 * Task complexity levels
 */
export type Complexity = 'trivial' | 'low' | 'medium' | 'high' | 'critical'

/**
 * Intent analysis result
 */
export interface IntentAnalysis {
  readonly type: IntentType
  readonly complexity: Complexity
  readonly confidence: number
  readonly reasoning: string
  readonly suggestedAgents: readonly string[]
  readonly suggestedSkills: readonly string[]
  readonly suggestedTools: readonly string[]
  readonly requiresPlanning: boolean
  readonly requiresReview: boolean
}

/**
 * Task decomposition
 */
export interface Task {
  readonly id: string
  readonly description: string
  readonly type: IntentType
  readonly complexity: Complexity
  readonly dependencies: readonly string[]
  readonly assignedAgent?: string
  readonly status: 'pending' | 'in_progress' | 'completed' | 'failed'
  readonly result?: unknown
  readonly error?: string
}

export interface TaskDecomposition {
  readonly tasks: readonly Task[]
  readonly estimatedDuration: number
  readonly canParallelize: boolean[]
}

/**
 * Resource requirements for a task
 */
export interface ResourceRequirements {
  readonly agents: readonly string[]
  readonly skills: readonly string[]
  readonly rules: readonly string[]
  readonly mcpServers: readonly string[]
  readonly tools: readonly string[]
  readonly model?: string
}

/**
 * Execution plan
 */
export interface ExecutionPlan {
  readonly intent: IntentAnalysis
  readonly decomposition: TaskDecomposition
  readonly resources: ResourceRequirements
  readonly estimatedDuration: number
  readonly steps: readonly ExecutionStep[]
}

export interface ExecutionStep {
  readonly taskId: string
  readonly agent: string
  readonly prompt: string
  readonly tools: readonly string[]
  readonly expectedOutcome: string
}

/**
 * Orchestrator state
 */
export interface OrchestratorState {
  readonly currentTask: Task | null
  readonly completedTasks: readonly Task[]
  readonly pendingTasks: readonly Task[]
  readonly activeAgent: string | null
  readonly context: Record<string, unknown>
}

/**
 * Project context for orchestration
 */
export interface ProjectContext {
  readonly projectRoot: string
  readonly language: string
  readonly framework?: string
  readonly packageManager: string
  readonly hasTests: boolean
  readonly hasLinting: boolean
  readonly hasTypeChecking: boolean
  readonly recentCommits: readonly string[]
  readonly openPRs: number
  readonly issues: number
}

/**
 * Main Orchestrator class
 */
export class Orchestrator {
  private state: OrchestratorState = {
    currentTask: null,
    completedTasks: [],
    pendingTasks: [],
    activeAgent: null,
    context: {},
  }

  private projectContext: ProjectContext | null = null

  /**
   * Analyze user intent
   */
  async analyzeIntent(input: string, _context?: Partial<ProjectContext>): Promise<IntentAnalysis> {
    const fullContext = this.projectContext ?? null
    
    // Use AI to analyze intent
    // In real implementation, this would call the model router
    
    // For now, return a basic analysis based on patterns
    
    const analysis = this.ruleBasedIntentAnalysis(input, fullContext)
    
    logger.info('Intent analyzed', { 
      type: analysis.type, 
      complexity: analysis.complexity,
      confidence: analysis.confidence 
    })
    
    return analysis
  }

  /**
   * Rule-based intent analysis (fallback)
   */
  private ruleBasedIntentAnalysis(input: string, _context: ProjectContext | null): IntentAnalysis {
    const lowerInput = input.toLowerCase()
    
    // Code review patterns
    if (lowerInput.includes('review') || lowerInput.includes('审查') || lowerInput.includes('检查代码')) {
      return {
        type: 'code_review',
        complexity: 'medium',
        confidence: 0.9,
        reasoning: 'Detected code review intent from keywords',
        suggestedAgents: ['review', 'code-reviewer'],
        suggestedSkills: ['/review'],
        suggestedTools: ['read', 'grep', 'glob'],
        requiresPlanning: false,
        requiresReview: false,
      }
    }
    
    // Bug fix patterns
    if (lowerInput.includes('bug') || lowerInput.includes('fix') || lowerInput.includes('修复') || lowerInput.includes('错误')) {
      return {
        type: 'bug_fix',
        complexity: 'medium',
        confidence: 0.85,
        reasoning: 'Detected bug fix intent',
        suggestedAgents: ['build'],
        suggestedSkills: [],
        suggestedTools: ['grep', 'read', 'edit'],
        requiresPlanning: true,
        requiresReview: true,
      }
    }
    
    // Refactoring patterns
    if (lowerInput.includes('refactor') || lowerInput.includes('重构') || lowerInput.includes('优化')) {
      return {
        type: 'refactoring',
        complexity: 'high',
        confidence: 0.8,
        reasoning: 'Detected refactoring intent',
        suggestedAgents: ['build', 'review'],
        suggestedSkills: [],
        suggestedTools: ['read', 'edit', 'grep'],
        requiresPlanning: true,
        requiresReview: true,
      }
    }
    
    // Testing patterns
    if (lowerInput.includes('test') || lowerInput.includes('测试')) {
      return {
        type: 'testing',
        complexity: 'medium',
        confidence: 0.85,
        reasoning: 'Detected testing intent',
        suggestedAgents: ['build'],
        suggestedSkills: ['/test'],
        suggestedTools: ['bash', 'read'],
        requiresPlanning: false,
        requiresReview: false,
      }
    }
    
    // Project setup patterns
    if (lowerInput.includes('init') || lowerInput.includes('setup') || lowerInput.includes('初始化') || lowerInput.includes('创建项目')) {
      return {
        type: 'project_setup',
        complexity: 'high',
        confidence: 0.9,
        reasoning: 'Detected project setup intent',
        suggestedAgents: ['build'],
        suggestedSkills: [],
        suggestedTools: ['bash', 'write'],
        requiresPlanning: true,
        requiresReview: true,
      }
    }
    
    // Code generation patterns
    if (lowerInput.includes('create') || lowerInput.includes('implement') || lowerInput.includes('创建') || lowerInput.includes('实现')) {
      return {
        type: 'code_generation',
        complexity: 'medium',
        confidence: 0.75,
        reasoning: 'Detected code generation intent',
        suggestedAgents: ['build'],
        suggestedSkills: [],
        suggestedTools: ['write', 'read', 'glob'],
        requiresPlanning: true,
        requiresReview: true,
      }
    }
    
    // Exploration patterns
    if (lowerInput.includes('find') || lowerInput.includes('search') || lowerInput.includes('查找') || lowerInput.includes('搜索') || lowerInput.includes('where')) {
      return {
        type: 'exploration',
        complexity: 'low',
        confidence: 0.9,
        reasoning: 'Detected exploration intent',
        suggestedAgents: ['explore'],
        suggestedSkills: [],
        suggestedTools: ['grep', 'glob', 'read'],
        requiresPlanning: false,
        requiresReview: false,
      }
    }
    
    // Simple QA
    if (lowerInput.includes('what') || lowerInput.includes('how') || lowerInput.includes('why') || lowerInput.includes('什么') || lowerInput.includes('如何') || lowerInput.includes('为什么')) {
      return {
        type: 'simple_qa',
        complexity: 'trivial',
        confidence: 0.8,
        reasoning: 'Detected simple Q&A intent',
        suggestedAgents: ['general'],
        suggestedSkills: [],
        suggestedTools: ['read', 'grep'],
        requiresPlanning: false,
        requiresReview: false,
      }
    }
    
    // Multi-step / complex patterns
    if (lowerInput.includes('and then') || lowerInput.includes('then') || lowerInput.includes('接下来') || lowerInput.includes('然后')) {
      return {
        type: 'multi_step',
        complexity: 'high',
        confidence: 0.7,
        reasoning: 'Detected multi-step task',
        suggestedAgents: ['build', 'plan'],
        suggestedSkills: [],
        suggestedTools: [],
        requiresPlanning: true,
        requiresReview: true,
      }
    }
    
    // Default to code modification
    return {
      type: 'code_modification',
      complexity: 'medium',
      confidence: 0.6,
      reasoning: 'Default to code modification',
      suggestedAgents: ['build'],
      suggestedSkills: [],
      suggestedTools: ['read', 'edit', 'write'],
      requiresPlanning: false,
      requiresReview: true,
    }
  }

  /**
   * Decompose task into subtasks
   */
  async decomposeTask(
    intent: IntentAnalysis,
    _context?: ProjectContext
  ): Promise<TaskDecomposition> {
    const tasks: Task[] = []
    
    // Simple tasks don't need decomposition
    if (intent.complexity === 'trivial' || intent.complexity === 'low') {
      return {
        tasks: [{
          id: 'main',
          description: 'Execute task directly',
          type: intent.type,
          complexity: intent.complexity,
          dependencies: [],
          status: 'pending',
        }],
        estimatedDuration: 300, // 5 minutes
        canParallelize: [false],
      }
    }

    // Complex tasks need planning first
    if (intent.requiresPlanning) {
      tasks.push({
        id: 'plan',
        description: 'Create implementation plan',
        type: 'multi_step',
        complexity: 'medium',
        dependencies: [],
        assignedAgent: 'plan',
        status: 'pending',
      })
    }

    // Main execution task
    tasks.push({
      id: 'execute',
      description: 'Execute the main task',
      type: intent.type,
      complexity: intent.complexity,
      dependencies: intent.requiresPlanning ? ['plan'] : [],
      assignedAgent: intent.suggestedAgents[0] ?? 'build',
      status: 'pending',
    })

    // Review task if needed
    if (intent.requiresReview) {
      tasks.push({
        id: 'review',
        description: 'Review the changes',
        type: 'code_review',
        complexity: 'low',
        dependencies: ['execute'],
        assignedAgent: 'review',
        status: 'pending',
      })
    }

    const canParallelize = tasks.map((_, i) => {
      // First task can run
      if (i === 0) return true
      // Tasks with dependencies can't parallelize
      return tasks[i]!.dependencies.length === 0
    })

    return {
      tasks,
      estimatedDuration: this.estimateDuration(intent.complexity),
      canParallelize,
    }
  }

  /**
   * Estimate task duration
   */
  private estimateDuration(complexity: Complexity): number {
    const baseDurations: Record<Complexity, number> = {
      trivial: 60,
      low: 300,
      medium: 900,
      high: 3600,
      critical: 7200,
    }
    return baseDurations[complexity]
  }

  /**
   * Create execution plan
   */
  async createPlan(
    input: string,
    context?: ProjectContext
  ): Promise<ExecutionPlan> {
    // Analyze intent
    const intent = await this.analyzeIntent(input, context)
    
    // Decompose task
    const decomposition = await this.decomposeTask(intent, context)
    
    // Determine resources
    const resources = this.determineResources(intent, context ?? null)
    
    // Build execution steps
    const steps = this.buildExecutionSteps(decomposition, intent, resources)
    
    return {
      intent,
      decomposition,
      resources,
      estimatedDuration: decomposition.estimatedDuration,
      steps,
    }
  }

  /**
   * Determine required resources
   */
  private determineResources(
    intent: IntentAnalysis,
    context: ProjectContext | null
  ): ResourceRequirements {
    const agents = [...intent.suggestedAgents]
    const skills = [...intent.suggestedSkills]
    const tools = [...intent.suggestedTools]
    const rules: string[] = []
    const mcpServers: string[] = []

    // Add context-specific resources
    if (context?.hasTests && intent.type === 'bug_fix') {
      skills.push('/test')
      tools.push('bash')
    }

    if (context?.hasLinting) {
      rules.push('lint-rules')
    }

    if (context?.hasTypeChecking) {
      rules.push('type-check-rules')
    }

    // Select model based on complexity
    let model: string | undefined
    if (intent.complexity === 'critical' || intent.complexity === 'high') {
      model = 'claude-opus-4-20250514'
    } else if (intent.complexity === 'medium') {
      model = 'claude-sonnet-4-20250514'
    } else {
      model = 'gpt-4o-mini'
    }

    return { agents, skills, rules, mcpServers, tools, model }
  }

  /**
   * Build execution steps
   */
  private buildExecutionSteps(
    decomposition: TaskDecomposition,
    _intent: IntentAnalysis,
    resources: ResourceRequirements
  ): ExecutionStep[] {
    const steps: ExecutionStep[] = []

    for (const task of decomposition.tasks) {
      steps.push({
        taskId: task.id,
        agent: task.assignedAgent ?? resources.agents[0] ?? 'build',
        prompt: task.description,
        tools: resources.tools,
        expectedOutcome: `Task ${task.id} completed successfully`,
      })
    }

    return steps
  }

  /**
   * Set project context
   */
  setProjectContext(context: ProjectContext): void {
    this.projectContext = context
    logger.info('Project context set', { language: context.language })
  }

  /**
   * Get current state
   */
  getState(): OrchestratorState {
    return { ...this.state }
  }

  /**
   * Update state
   */
  updateState(updates: Partial<OrchestratorState>): void {
    this.state = { ...this.state, ...updates }
  }
}

// Singleton
let orchestratorInstance: Orchestrator | null = null

export function getOrchestrator(): Orchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new Orchestrator()
  }
  return orchestratorInstance
}

export async function initializeOrchestrator(context?: ProjectContext): Promise<Orchestrator> {
  const orchestrator = getOrchestrator()
  if (context) {
    orchestrator.setProjectContext(context)
  }
  return orchestrator
}
