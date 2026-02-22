// Types
export type {
  TaskComplexity,
  TaskType,
  MessageRole,
  Message,
  Conversation,
  Intent,
  ExecutionResult,
  RoutingStrategy,
  ModelProvider,
  ModelContextInfo,
  ModelConfig,
  ProviderConfig,
  RoutingConfig,
  ModelsConfig,
  Permission,
  PermissionMode,
  PermissionCheckResult,
  ToolPermissionRule,
  SkillTrigger,
  SkillManifest,
  SkillContext,
  SkillInput,
  SkillOutput,
  EventType,
  SystemEvent,
  EventHandler,
} from './types.js'

export { PermissionSchema } from './types.js'

// Configuration
export { ConfigManager, getConfigManager, initializeConfig } from './config.js'

// Logging
export {
  createLogger,
  getLogger,
  initializeLogger,
  createModuleLogger,
  type Logger,
  type LogLevel,
  type LogContext,
} from './logger.js'

// Events
export { EventEmitter, getEventEmitter, on, emit } from './events.js'

// I18n
export {
  initializeI18n,
  t,
  setLocale,
  getLocale,
  getAvailableLocales,
  getLocaleDisplayName,
  getLanguageInstruction,
  getAILanguageInstruction,
  getThinkingPrefix,
  getFeedbackMessages,
  LANGUAGE_INSTRUCTIONS,
  type Locale,
  type TranslationData,
  type LanguageInstruction,
} from './i18n.js'

// Theme
export {
  getThemeManager,
  initializeThemeManager,
  ThemeColorsSchema,
  ThemeSchema,
  type Theme,
  type ThemeColors,
  type InkColorMap,
} from './theme.js'

// API Config (统一配置)
export {
  loadConfig as loadApiConfig,
  saveConfig as saveApiConfig,
  isApiConfigured,
  getConfigPath as getApiConfigPath,
  getConfigDir,
  updateProviderConfig,
  setDefaultModel,
  getAvailableProviders,
  getProviderApiKey,
  getProviderBaseUrl,
  expandVariables,
  ConfigSchema,
  type AppConfig,
  type KnowledgeConfig,
  type McpServerConfig,
} from './api-config.js'

// Config Watcher
export { getConfigWatcher, initializeConfigWatcher, stopConfigWatcher } from './config-watcher.js'

// Snapshot
export { getSnapshotManager } from './snapshot.js'

// GitHub integration
export {
  classifyIssue,
  detectDuplicate,
  reviewPR,
  generateMentionResponse,
  processWebhookEvent,
  LABEL_TAXONOMY,
  type IssueClassification,
  type PRReviewResult,
  type WebhookEvent,
} from './github.js'

// Utilities
export {
  generateId,
  sleep,
  retry,
  truncate,
  deepClone,
  isObject,
  deepMerge,
  formatBytes,
  formatDuration,
  debounce,
  throttle,
  createDeferred,
  pMap,
} from './utils.js'

// Retry utilities
export {
  retryWithBackoff,
  retryWithResult,
  processBatch,
  CircuitBreaker,
  withFallback,
  withTimeout,
  type RetryOptions,
  type RetryResult,
  type BatchResult,
  type CircuitState,
  type CircuitBreakerOptions,
} from './retry-utils.js'

// Config hierarchy
export {
  ConfigHierarchy,
  getConfigHierarchy,
  loadMergedConfig,
  type ConfigScope,
  type ConfigLayer,
  type ConfigHierarchyOptions,
  type EnterprisePolicy,
  type MergedConfig,
} from './config-hierarchy.js'

// Audit monitor
export {
  AuditMonitor,
  getAuditMonitor,
  initializeAuditMonitor,
  logAudit,
  recordTokens,
  getUsageStats,
  MODEL_PRICING,
  type AuditEntry,
  type TokenUsage,
  type CostRecord,
  type UsageStatistics,
} from './audit-monitor.js'

// Orchestrator
export {
  Orchestrator,
  getOrchestrator,
  initializeOrchestrator,
  type IntentType,
  type Complexity,
  type IntentAnalysis,
  type Task,
  type TaskDecomposition,
  type ResourceRequirements,
  type ExecutionPlan,
  type ExecutionStep,
  type OrchestratorState,
  type ProjectContext,
} from './orchestrator.js'

// Project Analyzer
export {
  ProjectAnalyzer,
  getProjectAnalyzer,
  analyzeProject,
  type Technology,
  type ProjectStructure,
  type ProjectAnalysis,
} from './project-analyzer.js'

// Dynamic Agent Generator
export {
  DynamicAgentGenerator,
  getDynamicAgentGenerator,
  type AgentTemplate,
  type GeneratedAgent,
  type AgentAdaptation,
} from './dynamic-agent-generator.js'

// Adaptive Configurator
export {
  AdaptiveConfigurator,
  getAdaptiveConfigurator,
  adaptConfiguration,
  type ConfigItem,
  type ResourceConfig,
  type AdaptationRecommendation,
  type ConfigSnapshot,
} from './adaptive-configurator.js'

// Unattended Mode
export {
  TaskScheduler,
  getScheduler,
  createScheduler,
  BackgroundExecutor,
  getBackgroundExecutor,
  createBackgroundExecutor,
  createUnattendedMode,
  initUnattendedMode,
  type ScheduledTask,
  type TaskConfig,
  type TaskHandler,
  type TaskContext,
  type TaskResult,
  type TaskExecution,
  type TaskEvent,
  type TaskEventType,
  type BackgroundJob,
  type JobPriority,
  type JobStatus,
  type WorkerPoolConfig,
  type JobHandler,
  type BackgroundJobEvent,
  type UnattendedConfig,
  type TaskDefinition,
  type NotificationConfig,
  BUILT_IN_TASKS,
} from './unattended/index.js'

// Agents Team
export {
  TeamManager,
  getTeamManager,
  createTeamManager,
  CollaborationEngine,
  getCollaborationEngine,
  createCollaborationEngine,
  createTeamFromTemplate,
  type AgentRole,
  type TeamMember,
  type MemberStatus,
  type Team,
  type TeamMode,
  type TeamConfig,
  type TeamTask,
  type TaskStatus,
  type TaskPriority,
  type TeamMessage,
  type MessageType,
  type TeamEvent,
  type TeamEventType,
  type CollaborationSession,
  type CollaborationMode,
  type CollaborationPhase,
  type CollaborationResult,
  type AgentExecutionContext,
  type AgentExecutor,
  TEAM_TEMPLATES,
} from './agents-team/index.js'

// Re-export with alias to avoid conflicts
export { type TaskResult as TeamTaskResult, type SessionStatus as TeamSessionStatus } from './agents-team/index.js'

// Self-Referential Loop
export {
  SelfLoopController,
  getLoopController,
  createLoopController,
  SelfImprover,
  getSelfImprover,
  createSelfImprover,
  runRalphExLoop,
  quickImprove,
  startRalphEx,
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
  type Improvement,
  type LoopEvent,
  type LoopEventType,
  type LoopAnalyzer,
  type LoopExecutor,
  type LearningRecord,
  type Feedback,
  type AdaptationRule,
  type ImprovementStrategy,
  type RalphExConfig,
  type RalphExResult,
  type LoopStatus,
  LOOP_TEMPLATES,
} from './self-loop/index.js'

// Re-export with alias to avoid conflicts
export { type SessionStatus as LoopSessionStatus } from './self-loop/index.js'

// Channels (Multi-platform messaging)
export {
  ChannelManager,
  getChannelManager,
  createChannelManager,
  type ChannelConfig,
  type ChannelPlatform,
  type ChannelCredentials,
  type ChannelSettings,
  type InboundMessage,
  type OutboundMessage,
  type MessageAttachment,
  type ChannelEvent,
  type ChannelEventType,
  type ChannelAdapter,
  type ChannelUser,
  TelegramAdapter,
  SlackAdapter,
  WhatsAppAdapter,
  DiscordAdapter,
  WebhookAdapter,
} from './channels/index.js'

// Browser Automation
export {
  BrowserManager,
  getBrowserManager,
  createBrowserManager,
  SemanticSnapshot,
  type BrowserConfig,
  type ViewportConfig,
  type ProxyConfig,
  type NavigateOptions,
  type ClickOptions,
  type FillOptions,
  type ScreenshotOptions,
  type EvaluationOptions,
  type BrowserPage,
  type BrowserContext,
  type ElementInfo,
  type BoundingBox,
  type ConsoleMessage,
  type NetworkRequest,
  type BrowserEvent,
  type BrowserEventType,
  type SemanticSnapshot as SemanticSnapshotResult,
  type InteractiveElement,
  type FormInfo,
  type FormField,
  type NavigationInfo,
} from './browser/index.js'

// Shell Executor
export {
  ShellExecutor,
  getShellExecutor,
  createSandboxExecutor,
  createTrustedExecutor,
  createReadonlyExecutor,
  type ShellConfig,
  type ShellMode,
  type ShellCommand,
  type ShellResult,
  type ShellStreamResult,
  type BlockedCommand,
  type TrustConfig,
} from './shell/index.js'
