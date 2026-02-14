import { z } from 'zod'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { createModuleLogger } from './logger.js'

const logger = createModuleLogger('theme')

// ── Schema ──────────────────────────────────────────────

export const ThemeColorsSchema = z.object({
  primary: z.string(),
  secondary: z.string(),
  background: z.string(),
  backgroundAlt: z.string(),
  surface: z.string(),
  foreground: z.string(),
  muted: z.string(),
  border: z.string(),
  success: z.string(),
  warning: z.string(),
  error: z.string(),
})

export const ThemeSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  type: z.enum(['dark', 'light']),
  colors: ThemeColorsSchema,
})

export type ThemeColors = z.infer<typeof ThemeColorsSchema>
export type Theme = z.infer<typeof ThemeSchema>

// CLI Ink 颜色映射
export interface InkColorMap {
  readonly primary: string
  readonly secondary: string
  readonly bg: string
  readonly bgAlt: string
  readonly surface: string
  readonly fg: string
  readonly muted: string
  readonly border: string
  readonly success: string
  readonly warning: string
  readonly error: string
}

// ── 内置主题 ────────────────────────────────────────────

const BUILTIN_THEMES: readonly Theme[] = [
  {
    name: 'default-dark',
    displayName: '默认深色',
    type: 'dark',
    colors: {
      primary: '#6C8EEF',
      secondary: '#A78BFA',
      background: '#1A1B26',
      backgroundAlt: '#24283B',
      surface: '#2F3348',
      foreground: '#C0CAF5',
      muted: '#565F89',
      border: '#3B4261',
      success: '#9ECE6A',
      warning: '#E0AF68',
      error: '#F7768E',
    },
  },
  {
    name: 'default-light',
    displayName: '默认浅色',
    type: 'light',
    colors: {
      primary: '#4F6BED',
      secondary: '#7C3AED',
      background: '#FAFAFA',
      backgroundAlt: '#F0F0F0',
      surface: '#FFFFFF',
      foreground: '#1A1A2E',
      muted: '#9CA3AF',
      border: '#E5E7EB',
      success: '#22C55E',
      warning: '#F59E0B',
      error: '#EF4444',
    },
  },
  {
    name: 'catppuccin-mocha',
    displayName: 'Catppuccin Mocha',
    type: 'dark',
    colors: {
      primary: '#89B4FA',
      secondary: '#CBA6F7',
      background: '#1E1E2E',
      backgroundAlt: '#181825',
      surface: '#313244',
      foreground: '#CDD6F4',
      muted: '#6C7086',
      border: '#45475A',
      success: '#A6E3A1',
      warning: '#F9E2AF',
      error: '#F38BA8',
    },
  },
  {
    name: 'dracula',
    displayName: 'Dracula',
    type: 'dark',
    colors: {
      primary: '#BD93F9',
      secondary: '#FF79C6',
      background: '#282A36',
      backgroundAlt: '#21222C',
      surface: '#44475A',
      foreground: '#F8F8F2',
      muted: '#6272A4',
      border: '#44475A',
      success: '#50FA7B',
      warning: '#F1FA8C',
      error: '#FF5555',
    },
  },
  {
    name: 'nord',
    displayName: 'Nord',
    type: 'dark',
    colors: {
      primary: '#88C0D0',
      secondary: '#81A1C1',
      background: '#2E3440',
      backgroundAlt: '#3B4252',
      surface: '#434C5E',
      foreground: '#ECEFF4',
      muted: '#4C566A',
      border: '#4C566A',
      success: '#A3BE8C',
      warning: '#EBCB8B',
      error: '#BF616A',
    },
  },
]

// ── ThemeManager ─────────────────────────────────────────

export class ThemeManager {
  private currentThemeName: string = 'default-dark'
  private readonly userThemes: Theme[] = []
  private readonly themesDir: string

  constructor() {
    this.themesDir = path.join(os.homedir(), '.wqbot', 'themes')
  }

  /** 当前主题 */
  getTheme(): Theme {
    const theme = this.getByName(this.currentThemeName)
    if (theme) return theme
    // BUILTIN_THEMES 至少有一个元素，这里安全断言
    return BUILTIN_THEMES[0] as Theme
  }

  /** 按名称查找主题 */
  getByName(name: string): Theme | undefined {
    return (
      this.userThemes.find((t) => t.name === name) ??
      BUILTIN_THEMES.find((t) => t.name === name)
    )
  }

  /** 列出所有可用主题（内置 + 用户自定义） */
  listThemes(): readonly Theme[] {
    return [...BUILTIN_THEMES, ...this.userThemes]
  }

  /** 切换当前主题 */
  setTheme(name: string): void {
    const theme = this.getByName(name)
    if (!theme) {
      throw new Error(`主题不存在: ${name}`)
    }
    this.currentThemeName = name
    logger.info('主题已切换', { name })
  }

  /** 扫描 ~/.wqbot/themes/*.json 加载用户自定义主题 */
  async loadUserThemes(): Promise<void> {
    this.userThemes.length = 0

    if (!fs.existsSync(this.themesDir)) {
      return
    }

    const files = await fs.promises.readdir(this.themesDir)

    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const content = await fs.promises.readFile(
          path.join(this.themesDir, file),
          'utf-8'
        )
        const parsed = ThemeSchema.safeParse(JSON.parse(content))
        if (parsed.success) {
          this.userThemes.push(parsed.data)
          logger.debug('已加载用户主题', { name: parsed.data.name })
        }
      } catch (error) {
        logger.warn('加载用户主题失败', { file, error })
      }
    }
  }

  /** 将主题颜色转换为 CSS 变量（供 GUI 使用） */
  toCssVariables(theme?: Theme): Record<string, string> {
    const t = theme ?? this.getTheme()
    return {
      '--bg-primary': t.colors.background,
      '--bg-secondary': t.colors.backgroundAlt,
      '--bg-surface': t.colors.surface,
      '--text-primary': t.colors.foreground,
      '--text-secondary': t.colors.muted,
      '--accent-primary': t.colors.primary,
      '--accent-secondary': t.colors.secondary,
      '--border-color': t.colors.border,
      '--color-success': t.colors.success,
      '--color-warning': t.colors.warning,
      '--color-error': t.colors.error,
    }
  }

  /** 将主题颜色转换为 Ink 颜色映射（供 CLI 使用） */
  toInkColors(theme?: Theme): InkColorMap {
    const t = theme ?? this.getTheme()
    return {
      primary: t.colors.primary,
      secondary: t.colors.secondary,
      bg: t.colors.background,
      bgAlt: t.colors.backgroundAlt,
      surface: t.colors.surface,
      fg: t.colors.foreground,
      muted: t.colors.muted,
      border: t.colors.border,
      success: t.colors.success,
      warning: t.colors.warning,
      error: t.colors.error,
    }
  }
}

// 单例
let themeManagerInstance: ThemeManager | null = null

export function getThemeManager(): ThemeManager {
  if (!themeManagerInstance) {
    themeManagerInstance = new ThemeManager()
  }
  return themeManagerInstance
}

export async function initializeThemeManager(): Promise<ThemeManager> {
  const manager = getThemeManager()
  await manager.loadUserThemes()
  return manager
}
