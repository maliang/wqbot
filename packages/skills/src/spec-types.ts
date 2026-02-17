import { z } from 'zod'

/**
 * Spec task status
 */
export type SpecTaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked'

/**
 * Spec task priority
 */
export type SpecTaskPriority = 'low' | 'medium' | 'high' | 'critical'

/**
 * Spec requirement
 */
export const SpecRequirementSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  status: z.enum(['pending', 'in_progress', 'completed', 'blocked']).default('pending'),
  dependencies: z.array(z.string()).optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
})

export type SpecRequirement = z.infer<typeof SpecRequirementSchema>

/**
 * Spec task
 */
export const SpecTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  requirementId: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'blocked']).default('pending'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  assignee: z.string().optional(),
  estimatedHours: z.number().optional(),
  actualHours: z.number().optional(),
  dependencies: z.array(z.string()).optional(),
  notes: z.array(z.string()).optional(),
})

export type SpecTask = z.infer<typeof SpecTaskSchema>

/**
 * Spec design section
 */
export const SpecDesignSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  diagrams: z.array(z.object({
    name: z.string(),
    type: z.enum(['sequence', 'flowchart', 'class', 'er', 'custom']),
    content: z.string(),
  })).optional(),
})

export type SpecDesign = z.infer<typeof SpecDesignSchema>

/**
 * Full spec definition
 */
export const SpecDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string().default('1.0.0'),
  status: z.enum(['draft', 'active', 'completed', 'archived']).default('draft'),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  author: z.string().optional(),
  
  // Metadata
  tags: z.array(z.string()).optional(),
  
  // Requirements
  requirements: z.array(SpecRequirementSchema).default([]),
  
  // Design
  design: z.array(SpecDesignSchema).optional(),
  
  // Tasks
  tasks: z.array(SpecTaskSchema).default([]),
  
  // Progress tracking
  progress: z.object({
    totalRequirements: z.number().default(0),
    completedRequirements: z.number().default(0),
    totalTasks: z.number().default(0),
    completedTasks: z.number().default(0),
    percentage: z.number().default(0),
  }).optional(),
})

export type SpecDefinition = z.infer<typeof SpecDefinitionSchema>

/**
 * Spec file (parsed from markdown)
 */
export interface SpecFile {
  readonly path: string
  readonly type: 'requirement' | 'design' | 'task'
  readonly specId: string
  readonly content: SpecRequirement | SpecDesign | SpecTask
}
