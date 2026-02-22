import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

vi.mock('@wqbot/core', () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { SpecLoader, getSpecLoader } from '../src/spec-loader.js'

describe('SpecLoader', () => {
  let loader: SpecLoader
  let tempDir: string

  beforeEach(async () => {
    vi.clearAllMocks()
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-test-'))
    loader = new SpecLoader(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('loadAll', () => {
    it('returns empty array when no specs directory', async () => {
      const result = await loader.loadAll()
      expect(result).toEqual([])
    })

    it('loads spec from directory', async () => {
      const specDir = path.join(tempDir, '.wqbot', 'specs', 'my-spec')
      await fs.mkdir(specDir, { recursive: true })

      const specContent = `---
name: My Feature
description: Feature description
version: 1.0.0
status: draft
author: Test Author
---

# My Feature

This is the spec body.`

      await fs.writeFile(path.join(specDir, 'spec.md'), specContent)

      const result = await loader.loadAll()

      expect(result.length).toBe(1)
      expect(result[0]!.name).toBe('My Feature')
      expect(result[0]!.description).toContain('Feature description')
      expect(result[0]!.version).toBe('1.0.0')
      expect(result[0]!.status).toBe('draft')
      expect(result[0]!.author).toBe('Test Author')
    })

    it('loads requirements from requirements directory', async () => {
      const specDir = path.join(tempDir, '.wqbot', 'specs', 'my-spec')
      const reqDir = path.join(specDir, 'requirements')
      await fs.mkdir(reqDir, { recursive: true })

      const reqContent = `---
title: User Authentication
priority: high
status: pending
---

Users must be able to authenticate.`

      await fs.writeFile(path.join(reqDir, 'auth.md'), reqContent)

      const result = await loader.loadAll()

      expect(result[0]!.requirements.length).toBe(1)
      expect(result[0]!.requirements[0]!.title).toBe('User Authentication')
      expect(result[0]!.requirements[0]!.priority).toBe('high')
    })

    it('loads tasks from tasks directory', async () => {
      const specDir = path.join(tempDir, '.wqbot', 'specs', 'my-spec')
      await fs.mkdir(specDir, { recursive: true }) // Create spec dir first
      const tasksDir = path.join(specDir, 'tasks')
      await fs.mkdir(tasksDir, { recursive: true })

      // Create a basic spec.md to ensure the spec is loaded
      await fs.writeFile(path.join(specDir, 'spec.md'), `---
name: Test Spec
---
content`)

      const taskContent = `---
title: Implement Login
requirementId: auth
status: in_progress
priority: high
estimatedHours: 4
assignee: developer
---

Task description here.`

      await fs.writeFile(path.join(tasksDir, 'task-1.md'), taskContent)

      const result = await loader.loadAll()

      expect(result[0]!.tasks.length).toBe(1)
      expect(result[0]!.tasks[0]!.title).toBe('Implement Login')
      expect(result[0]!.tasks[0]!.requirementId).toBe('auth')
      expect(result[0]!.tasks[0]!.estimatedHours).toBe(4)
    })

    it('loads designs from design directory', async () => {
      const specDir = path.join(tempDir, '.wqbot', 'specs', 'my-spec')
      const designDir = path.join(specDir, 'design')
      await fs.mkdir(designDir, { recursive: true })

      const designContent = `---
title: Architecture Diagram
diagrams: [system-overview]
---

## Architecture

Content here.`

      await fs.writeFile(path.join(designDir, 'architecture.md'), designContent)

      const result = await loader.loadAll()

      expect(result[0]!.design!.length).toBe(1)
      expect(result[0]!.design![0]!.title).toBe('Architecture Diagram')
    })

    it('calculates progress correctly', async () => {
      const specDir = path.join(tempDir, '.wqbot', 'specs', 'my-spec')
      const reqDir = path.join(specDir, 'requirements')
      const tasksDir = path.join(specDir, 'tasks')
      await fs.mkdir(reqDir, { recursive: true })
      await fs.mkdir(tasksDir, { recursive: true })

      // One completed requirement
      await fs.writeFile(path.join(reqDir, 'req1.md'), `---
title: Req 1
status: completed
---
content`)

      // One pending requirement
      await fs.writeFile(path.join(reqDir, 'req2.md'), `---
title: Req 2
status: pending
---
content`)

      // One completed task
      await fs.writeFile(path.join(tasksDir, 'task1.md'), `---
title: Task 1
status: completed
requirementId: req1
---
content`)

      // One pending task
      await fs.writeFile(path.join(tasksDir, 'task2.md'), `---
title: Task 2
status: pending
requirementId: req1
---
content`)

      const result = await loader.loadAll()

      expect(result[0]!.progress!.totalRequirements).toBe(2)
      expect(result[0]!.progress!.completedRequirements).toBe(1)
      expect(result[0]!.progress!.totalTasks).toBe(2)
      expect(result[0]!.progress!.completedTasks).toBe(1)
      expect(result[0]!.progress!.percentage).toBe(50) // 2 of 4 completed
    })

    it('uses defaults for missing spec.md', async () => {
      const specDir = path.join(tempDir, '.wqbot', 'specs', 'my-spec')
      await fs.mkdir(specDir, { recursive: true })

      const result = await loader.loadAll()

      expect(result.length).toBe(1)
      expect(result[0]!.name).toBe('my-spec')
      expect(result[0]!.version).toBe('1.0.0')
      expect(result[0]!.status).toBe('draft')
    })
  })

  describe('getSpecsDir', () => {
    it('returns specs directory path', () => {
      const specsDir = loader.getSpecsDir()
      expect(specsDir).toContain('.wqbot')
      expect(specsDir).toContain('specs')
    })
  })

  describe('parsing edge cases', () => {
    it('parses numeric values', async () => {
      const specDir = path.join(tempDir, '.wqbot', 'specs', 'num-spec')
      const tasksDir = path.join(specDir, 'tasks')
      await fs.mkdir(tasksDir, { recursive: true })

      const taskContent = `---
title: Numeric Task
estimatedHours: 8
actualHours: 6.5
requirementId: req
---
content`

      await fs.writeFile(path.join(tasksDir, 'task1.md'), taskContent)

      const result = await loader.loadAll()

      expect(result[0]!.tasks[0]!.estimatedHours).toBe(8)
      expect(result[0]!.tasks[0]!.actualHours).toBe(6.5)
    })

    it('parses array values', async () => {
      const specDir = path.join(tempDir, '.wqbot', 'specs', 'array-spec')
      await fs.mkdir(specDir, { recursive: true })

      const specContent = `---
name: Array Spec
tags: [tag1, tag2, tag3]
---
content`

      await fs.writeFile(path.join(specDir, 'spec.md'), specContent)

      const result = await loader.loadAll()

      expect(result[0]!.tags).toEqual(['tag1', 'tag2', 'tag3'])
    })
  })
})

describe('getSpecLoader', () => {
  it('returns singleton instance', () => {
    const instance1 = getSpecLoader()
    const instance2 = getSpecLoader()
    expect(instance1).toBe(instance2)
  })
})
