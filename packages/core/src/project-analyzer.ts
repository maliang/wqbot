import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createModuleLogger } from '@wqbot/core'
import type { ProjectContext } from './orchestrator.js'

const logger = createModuleLogger('project-analyzer')

/**
 * Detected technology
 */
export interface Technology {
  readonly name: string
  readonly category: 'language' | 'framework' | 'packageManager' | 'testing' | 'linting' | 'database' | 'ci' | 'other'
  readonly version?: string
  readonly confidence: number
}

/**
 * Project structure
 */
export interface ProjectStructure {
  readonly rootFiles: readonly string[]
  readonly directories: readonly string[]
  readonly configFiles: readonly string[]
  readonly sourceDirs: readonly string[]
  readonly testDirs: readonly string[]
}

/**
 * Full project analysis result
 */
export interface ProjectAnalysis {
  readonly context: ProjectContext
  readonly structure: ProjectStructure
  readonly technologies: readonly Technology[]
  readonly analysisDate: Date
}

/**
 * Project Analyzer - 自动分析项目结构和技术栈
 */
export class ProjectAnalyzer {
  private projectRoot: string
  private analysisCache: ProjectAnalysis | null = null

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot
  }

  /**
   * Full project analysis
   */
  async analyze(): Promise<ProjectAnalysis> {
    if (this.analysisCache) {
      return this.analysisCache
    }

    logger.info('Starting project analysis', { root: this.projectRoot })

    const [structure, technologies] = await Promise.all([
      this.analyzeStructure(),
      this.detectTechnologies(),
    ])

    const context = this.buildContext(structure, technologies)

    this.analysisCache = {
      context,
      structure,
      technologies,
      analysisDate: new Date(),
    }

    logger.info('Project analysis complete', {
      language: context.language,
      framework: context.framework,
      packageManager: context.packageManager,
    })

    return this.analysisCache
  }

  /**
   * Analyze project structure
   */
  private async analyzeStructure(): Promise<ProjectStructure> {
    const rootFiles: string[] = []
    const directories: string[] = []
    const configFiles: string[] = []
    const sourceDirs: string[] = []
    const testDirs: string[] = []

    try {
      const entries = await fs.readdir(this.projectRoot, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.isFile()) {
          rootFiles.push(entry.name)
          if (this.isConfigFile(entry.name)) {
            configFiles.push(entry.name)
          }
        } else if (entry.isDirectory()) {
          directories.push(entry.name)

          // Check for source directories
          if (this.isSourceDir(entry.name)) {
            sourceDirs.push(entry.name)
          }

          // Check for test directories
          if (this.isTestDir(entry.name)) {
            testDirs.push(entry.name)
          }
        }
      }
    } catch (error) {
      logger.error('Failed to analyze structure', error instanceof Error ? error : undefined)
    }

    return { rootFiles, directories, configFiles, sourceDirs, testDirs }
  }

  /**
   * Detect technologies used in the project
   */
  private async detectTechnologies(): Promise<Technology[]> {
    const technologies: Technology[] = []

    // Check package.json for Node.js projects
    const nodeTech = await this.detectNodeTech()
    technologies.push(...nodeTech)

    // Check for Python projects
    const pythonTech = await this.detectPythonTech()
    technologies.push(...pythonTech)

    // Check for Go projects
    const goTech = await this.detectGoTech()
    technologies.push(...goTech)

    // Check for Rust projects
    const rustTech = await this.detectRustTech()
    technologies.push(...rustTech)

    // Check for Java projects
    const javaTech = await this.detectJavaTech()
    technologies.push(...javaTech)

    // Check for other technologies
    const otherTech = await this.detectOtherTech()
    technologies.push(...otherTech)

    return technologies
  }

  /**
   * Detect Node.js/TypeScript technologies
   */
  private async detectNodeTech(): Promise<Technology[]> {
    const tech: Technology[] = []

    try {
      const packageJsonPath = path.join(this.projectRoot, 'package.json')
      const content = await fs.readFile(packageJsonPath, 'utf-8')
      const pkg = JSON.parse(content)

      // Language
      if (pkg.dependencies?.typescript || pkg.devDependencies?.typescript) {
        tech.push({
          name: 'TypeScript',
          category: 'language',
          version: pkg.devDependencies?.typescript ?? pkg.dependencies?.typescript,
          confidence: 1,
        })
      } else if (pkg.dependencies?.javascript !== undefined) {
        tech.push({ name: 'JavaScript', category: 'language', confidence: 1 })
      }

      // Framework detection
      if (pkg.dependencies?.react) {
        tech.push({ name: 'React', category: 'framework', confidence: 1 })
      }
      if (pkg.dependencies?.vue) {
        tech.push({ name: 'Vue', category: 'framework', confidence: 1 })
      }
      if (pkg.dependencies?.next) {
        tech.push({ name: 'Next.js', category: 'framework', confidence: 1 })
      }
      if (pkg.dependencies?.express) {
        tech.push({ name: 'Express', category: 'framework', confidence: 1 })
      }
      if (pkg.dependencies?.fastify) {
        tech.push({ name: 'Fastify', category: 'framework', confidence: 1 })
      }
      if (pkg.dependencies?.nest) {
        tech.push({ name: 'NestJS', category: 'framework', confidence: 1 })
      }
      if (pkg.dependencies?.@nestjs) {
        tech.push({ name: 'NestJS', category: 'framework', confidence: 1 })
      }

      // Package manager
      const lockFiles = await fs.readdir(this.projectRoot)
      if (lockFiles.includes('pnpm-lock.yaml')) {
        tech.push({ name: 'pnpm', category: 'packageManager', confidence: 1 })
      } else if (lockFiles.includes('yarn.lock')) {
        tech.push({ name: 'yarn', category: 'packageManager', confidence: 1 })
      } else if (lockFiles.includes('package-lock.json')) {
        tech.push({ name: 'npm', category: 'packageManager', confidence: 1 })
      }

      // Testing
      if (pkg.devDependencies?.jest || pkg.dependencies?.jest) {
        tech.push({ name: 'Jest', category: 'testing', confidence: 1 })
      }
      if (pkg.devDependencies?.vitest) {
        tech.push({ name: 'Vitest', category: 'testing', confidence: 1 })
      }
      if (pkg.devDependencies?.mocha) {
        tech.push({ name: 'Mocha', category: 'testing', confidence: 1 })
      }
      if (pkg.devDependencies?.playwright || pkg.dependencies?.playwright) {
        tech.push({ name: 'Playwright', category: 'testing', confidence: 1 })
      }
      if (pkg.devDependencies?.cypress) {
        tech.push({ name: 'Cypress', category: 'testing', confidence: 1 })
      }

      // Linting/Formatting
      if (pkg.devDependencies?.eslint) {
        tech.push({ name: 'ESLint', category: 'linting', confidence: 1 })
      }
      if (pkg.devDependencies?.prettier) {
        tech.push({ name: 'Prettier', category: 'linting', confidence: 1 })
      }
      if (pkg.devDependencies?.biome) {
        tech.push({ name: 'Biome', category: 'linting', confidence: 1 })
      }

      // Database
      if (pkg.dependencies?.prisma) {
        tech.push({ name: 'Prisma', category: 'database', confidence: 1 })
      }
      if (pkg.dependencies?.drizzle-orm) {
        tech.push({ name: 'Drizzle', category: 'database', confidence: 1 })
      }
      if (pkg.dependencies?.mongoose) {
        tech.push({ name: 'Mongoose', category: 'database', confidence: 1 })
      }
      if (pkg.dependencies?.sequelize) {
        tech.push({ name: 'Sequelize', category: 'database', confidence: 1 })
      }
      if (pkg.dependencies?.typeorm) {
        tech.push({ name: 'TypeORM', category: 'database', confidence: 1 })
      }

      // CI/CD
      if (pkg.devDependencies?.actions) {
        tech.push({ name: 'GitHub Actions', category: 'ci', confidence: 1 })
      }
    } catch {
      // package.json not found or invalid
    }

    return tech
  }

  /**
   * Detect Python technologies
   */
  private async detectPythonTech(): Promise<Technology[]> {
    const tech: Technology[] = []

    try {
      // Check for requirements.txt or pyproject.toml
      const hasRequirements = await this.fileExists('requirements.txt')
      const hasPyproject = await this.fileExists('pyproject.toml')
      const hasPipfile = await this.fileExists('Pipfile')
      const hasPoetry = await this.fileExists('poetry.lock')

      if (hasRequirements || hasPyproject || hasPipfile || hasPoetry) {
        tech.push({ name: 'Python', category: 'language', confidence: 1 })
      }

      if (hasPyproject) {
        const content = await fs.readFile(path.join(this.projectRoot, 'pyproject.toml'), 'utf-8')
        
        if (content.includes('pytest')) {
          tech.push({ name: 'pytest', category: 'testing', confidence: 1 })
        }
        if (content.includes('ruff')) {
          tech.push({ name: 'Ruff', category: 'linting', confidence: 1 })
        }
        if (content.includes('mypy')) {
          tech.push({ name: 'mypy', category: 'linting', confidence: 1 })
        }
        if (content.includes('fastapi')) {
          tech.push({ name: 'FastAPI', category: 'framework', confidence: 1 })
        }
        if (content.includes('django')) {
          tech.push({ name: 'Django', category: 'framework', confidence: 1 })
        }
        if (content.includes('flask')) {
          tech.push({ name: 'Flask', category: 'framework', confidence: 1 })
      }

      if (hasPoetry) {
        tech.push({ name: 'Poetry', category: 'packageManager', confidence: 1 })
      } else if (hasPipfile) {
        tech.push({ name: 'Pipenv', category: 'packageManager', confidence: 1 })
      }
    } catch {
      // Python files not found
    }

    return tech
  }

  /**
   * Detect Go technologies
   */
  private async detectGoTech(): Promise<Technology[]> {
    const tech: Technology[] = []

    try {
      const hasGoMod = await this.fileExists('go.mod')
      if (hasGoMod) {
        tech.push({ name: 'Go', category: 'language', confidence: 1 })

        const content = await fs.readFile(path.join(this.projectRoot, 'go.mod'), 'utf-8')
        
        if (content.includes('gin-gonic')) {
          tech.push({ name: 'Gin', category: 'framework', confidence: 0.9 })
        }
        if (content.includes('fiber')) {
          tech.push({ name: 'Fiber', category: 'framework', confidence: 0.9 })
        }
        if (content.includes('gorm')) {
          tech.push({ name: 'GORM', category: 'database', confidence: 0.9 })
        }
      }
    } catch {
      // go.mod not found
    }

    return tech
  }

  /**
   * Detect Rust technologies
   */
  private async detectRustTech(): Promise<Technology[]> {
    const tech: Technology[] = []

    try {
      const hasCargo = await this.fileExists('Cargo.toml')
      if (hasCargo) {
        tech.push({ name: 'Rust', category: 'language', confidence: 1 })

        const content = await fs.readFile(path.join(this.projectRoot, 'Cargo.toml'), 'utf-8')
        
        if (content.includes('actix')) {
          tech.push({ name: 'Actix', category: 'framework', confidence: 0.9 })
        }
        if (content.includes('axum')) {
          tech.push({ name: 'Axum', category: 'framework', confidence: 0.9 })
        }
        if (content.includes('rocket')) {
          tech.push({ name: 'Rocket', category: 'framework', confidence: 0.9 })
        }
        if (content.includes('tokio')) {
          tech.push({ name: 'Tokio', category: 'framework', confidence: 0.9 })
        }
        if (content.includes('diesel')) {
          tech.push({ name: 'Diesel', category: 'database', confidence: 0.9 })
        }
      }
    } catch {
      // Cargo.toml not found
    }

    return tech
  }

  /**
   * Detect Java technologies
   */
  private async detectJavaTech(): Promise<Technology[]> {
    const tech: Technology[] = []

    try {
      const hasPom = await this.fileExists('pom.xml')
      const hasGradle = await this.fileExists('build.gradle') || await this.fileExists('build.gradle.kts')

      if (hasPom) {
        tech.push({ name: 'Java', category: 'language', confidence: 1 })
        tech.push({ name: 'Maven', category: 'packageManager', confidence: 1 })
      } else if (hasGradle) {
        tech.push({ name: 'Java', category: 'language', confidence: 1 })
        tech.push({ name: 'Gradle', category: 'packageManager', confidence: 1 })

        const content = await fs.readFile(path.join(this.projectRoot, 'build.gradle'), 'utf-8')
        
        if (content.includes('spring-boot')) {
          tech.push({ name: 'Spring Boot', category: 'framework', confidence: 0.9 })
        }
      }
    } catch {
      // Java build files not found
    }

    return tech
  }

  /**
   * Detect other technologies
   */
  private async detectOtherTech(): Promise<Technology[]> {
    const tech: Technology[] = []

    // Check for Docker
    if (await this.fileExists('Dockerfile')) {
      tech.push({ name: 'Docker', category: 'other', confidence: 1 })
    }

    // Check for docker-compose
    if (await this.fileExists('docker-compose.yml') || await this.fileExists('docker-compose.yaml')) {
      tech.push({ name: 'Docker Compose', category: 'other', confidence: 1 })
    }

    // Check for GitHub Actions
    const githubActionsDir = path.join(this.projectRoot, '.github', 'workflows')
    try {
      const entries = await fs.readdir(githubActionsDir)
      if (entries.length > 0) {
        tech.push({ name: 'GitHub Actions', category: 'ci', confidence: 1 })
      }
    } catch {
      // .github/workflows not found
    }

    // Check for Terraform
    if (await this.fileExists('terraform.tf')) {
      tech.push({ name: 'Terraform', category: 'other', confidence: 1 })
    }

    // Check for Kubernetes
    if (await this.fileExists('k8s.yaml') || await this.fileExists('kubernetes.yaml')) {
      tech.push({ name: 'Kubernetes', category: 'other', confidence: 1 })
    }

    return tech
  }

  /**
   * Build project context
   */
  private buildContext(
    structure: ProjectStructure,
    technologies: Technology[]
  ): ProjectContext {
    // Detect primary language
    const language = this.detectPrimaryLanguage(technologies)

    // Detect framework
    const framework = technologies
      .filter(t => t.category === 'framework')
      .sort((a, b) => b.confidence - a.confidence)[0]?.name

    // Detect package manager
    const packageManager = technologies
      .filter(t => t.category === 'packageManager')
      .sort((a, b) => b.confidence - a.confidence)[0]?.name ?? 'npm'

    // Detect testing
    const hasTests = structure.testDirs.length > 0 ||
      technologies.some(t => t.category === 'testing')

    // Detect linting
    const hasLinting = technologies.some(t => t.category === 'linting')

    // Detect type checking
    const hasTypeChecking = technologies.some(t => 
      t.name === 'TypeScript' || t.name === 'mypy'
    )

    return {
      projectRoot: this.projectRoot,
      language,
      framework,
      packageManager,
      hasTests,
      hasLinting,
      hasTypeChecking,
      recentCommits: [],
      openPRs: 0,
      issues: 0,
    }
  }

  /**
   * Detect primary language
   */
  private detectPrimaryLanguage(technologies: Technology[]): string {
    const langs = technologies.filter(t => t.category === 'language')
    if (langs.length > 0) {
      return langs[0]!.name.toLowerCase()
    }
    return 'unknown'
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(path.join(this.projectRoot, filePath))
      return true
    } catch {
      return false
    }
  }

  /**
   * Check if file is a config file
   */
  private isConfigFile(filename: string): boolean {
    const configPatterns = [
      '.json', '.yaml', '.yml', '.toml', '.ini', '.conf',
      '.eslintrc', '.prettierrc', '.babelrc', '.npmrc',
      'tsconfig.json', 'jest.config', 'vitest.config',
    ]
    return configPatterns.some(p => filename.endsWith(p)) ||
      filename.startsWith('.')
  }

  /**
   * Check if directory is a source directory
   */
  private isSourceDir(dirname: string): boolean {
    return ['src', 'lib', 'app', 'source', 'packages'].includes(dirname)
  }

  /**
   * Check if directory is a test directory
   */
  private isTestDir(dirname: string): boolean {
    return ['test', 'tests', '__tests__', 'spec', 'e2e'].includes(dirname)
  }

  /**
   * Clear analysis cache
   */
  clearCache(): void {
    this.analysisCache = null
  }

  /**
   * Update project root
   */
  setProjectRoot(root: string): void {
    this.projectRoot = root
    this.clearCache()
  }
}

// Singleton
let analyzerInstance: ProjectAnalyzer | null = null

export function getProjectAnalyzer(projectRoot?: string): ProjectAnalyzer {
  if (!analyzerInstance) {
    analyzerInstance = new ProjectAnalyzer(projectRoot)
  }
  return analyzerInstance
}

export async function analyzeProject(projectRoot?: string): Promise<ProjectAnalysis> {
  const analyzer = new ProjectAnalyzer(projectRoot)
  return analyzer.analyze()
}

export type {
  Technology,
  ProjectStructure,
  ProjectAnalysis,
}
