import { describe, it, expect, vi } from 'vitest'

vi.mock('./logger.js', () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { ThemeManager } from './theme.js'

describe('ThemeManager', () => {
  const manager = new ThemeManager()

  it('getByName 找到内置主题', () => {
    const theme = manager.getByName('default-dark')
    expect(theme).toBeDefined()
    expect(theme!.name).toBe('default-dark')
  })

  it('getByName 不存在返回 undefined', () => {
    expect(manager.getByName('nonexist')).toBeUndefined()
  })

  it('listThemes 返回所有内置主题', () => {
    const themes = manager.listThemes()
    expect(themes.length).toBeGreaterThanOrEqual(5)
  })

  it('setTheme 有效名称切换成功', () => {
    manager.setTheme('dracula')
    expect(manager.getTheme().name).toBe('dracula')
  })

  it('setTheme 无效名称抛出错误', () => {
    expect(() => manager.setTheme('nonexist')).toThrow('主题不存在')
  })

  it('toCssVariables 返回正确 CSS 变量', () => {
    const vars = manager.toCssVariables()
    const keys = Object.keys(vars)
    expect(keys).toContain('--bg-primary')
    expect(keys).toContain('--accent-primary')
    expect(keys).toContain('--color-error')
    expect(keys.length).toBe(11)
  })

  it('toInkColors 返回正确颜色映射', () => {
    const colors = manager.toInkColors()
    expect(colors).toHaveProperty('primary')
    expect(colors).toHaveProperty('fg')
    expect(colors).toHaveProperty('error')
    expect(Object.keys(colors).length).toBe(11)
  })

  it('getTheme 默认返回 default-dark', () => {
    const fresh = new ThemeManager()
    expect(fresh.getTheme().name).toBe('default-dark')
  })
})
