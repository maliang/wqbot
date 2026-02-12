import { Command } from 'commander'
import chalk from 'chalk'
import { getConfigManager, t, getLocale, setLocale, getAvailableLocales, getLocaleDisplayName } from '@wqbot/core'
import type { Locale } from '@wqbot/core'
import { getSettingsStore } from '@wqbot/storage'
import { getModelRouter } from '@wqbot/models'
import { getSandbox } from '@wqbot/security'

export function configCommand(): Command {
  const cmd = new Command('config')
    .description('Manage WQBot configuration')

  cmd
    .command('show')
    .description('Show current configuration')
    .action(async () => {
      const config = getConfigManager()
      const settings = getSettingsStore()
      const appConfig = config.getConfig()
      const userSettings = settings.getAll()

      console.log(chalk.bold.cyan(`\n${t('config.title')}\n`))

      console.log(chalk.bold(`${t('config.appConfig')}:`))
      console.log(`  ${t('config.logLevel')}: ${appConfig.logLevel}`)
      console.log(`  ${t('config.routingStrategy')}: ${appConfig.routingStrategy}`)
      console.log(`  ${t('config.maxHistoryMessages')}: ${appConfig.maxHistoryMessages}`)
      console.log(`  ${t('config.sandboxEnabled')}: ${appConfig.sandbox.enabled}`)
      console.log(`  Language: ${getLocaleDisplayName(getLocale())}`)
      console.log()

      console.log(chalk.bold(`${t('config.userSettings')}:`))
      if (Object.keys(userSettings).length === 0) {
        console.log(`  ${t('config.noCustomSettings')}`)
      } else {
        for (const [key, value] of Object.entries(userSettings)) {
          console.log(`  ${key}: ${JSON.stringify(value)}`)
        }
      }
      console.log()

      console.log(chalk.bold(`${t('config.directories')}:`))
      console.log(`  ${t('config.dataDir')}: ${config.getDataDir()}`)
      console.log(`  ${t('config.skillsDir')}: ${config.getSkillsDir()}`)
      console.log()
    })

  cmd
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action(async (key: string, value: string) => {
      const settings = getSettingsStore()

      // Parse value
      let parsedValue: unknown
      try {
        parsedValue = JSON.parse(value)
      } catch {
        parsedValue = value
      }

      settings.set(key as keyof ReturnType<typeof settings.getAll>, parsedValue as never)
      console.log(chalk.green(t('config.set', { key, value: JSON.stringify(parsedValue) })))
    })

  cmd
    .command('get <key>')
    .description('Get a configuration value')
    .action(async (key: string) => {
      const settings = getSettingsStore()
      const value = settings.get(key as keyof ReturnType<typeof settings.getAll>)

      if (value === undefined) {
        console.log(chalk.yellow(`${key} ${t('config.notSet')}`))
      } else {
        console.log(`${key} = ${JSON.stringify(value)}`)
      }
    })

  cmd
    .command('reset')
    .description('Reset all settings to defaults')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (options) => {
      if (!options.yes) {
        console.log(chalk.yellow(t('config.resetConfirm')))
        console.log(chalk.dim(t('config.useYesToConfirm')))
        return
      }

      const settings = getSettingsStore()
      settings.reset()
      console.log(chalk.green(t('config.resetSuccess')))
    })

  cmd
    .command('language [locale]')
    .alias('lang')
    .description('Get or set the display language')
    .action(async (locale?: string) => {
      if (!locale) {
        // Show current language and available options
        const current = getLocale()
        const available = getAvailableLocales()

        console.log(chalk.bold.cyan('\nLanguage / 语言\n'))
        console.log(`Current / 当前: ${chalk.green(getLocaleDisplayName(current))} (${current})`)
        console.log()
        console.log('Available / 可用:')
        for (const loc of available) {
          const marker = loc === current ? chalk.green('✓') : ' '
          console.log(`  ${marker} ${loc.padEnd(8)} - ${getLocaleDisplayName(loc)}`)
        }
        console.log()
        console.log(chalk.dim('Usage / 用法: wqbot config language <locale>'))
        console.log(chalk.dim('Example / 示例: wqbot config language zh-CN'))
        console.log()
        return
      }

      const available = getAvailableLocales()
      if (!available.includes(locale as Locale)) {
        console.error(chalk.red(`Unsupported locale / 不支持的语言: ${locale}`))
        console.log(chalk.dim(`Available / 可用: ${available.join(', ')}`))
        return
      }

      setLocale(locale as Locale)

      // Save to settings
      const settings = getSettingsStore()
      settings.set('language', locale)

      console.log(chalk.green(`✓ Language set to / 语言已设置为: ${getLocaleDisplayName(locale as Locale)}`))
    })

  cmd
    .command('models')
    .description('Show available models and providers')
    .action(async () => {
      const config = getConfigManager()
      const router = getModelRouter()
      const modelsConfig = config.getModelsConfig()
      const availableProviders = router.getAvailableProviders()

      console.log(chalk.bold.cyan(`\n${t('models.title')}\n`))

      for (const [provider, providerConfig] of Object.entries(modelsConfig.providers)) {
        const isAvailable = availableProviders.includes(provider as never)
        const status = isAvailable
          ? chalk.green(`✓ ${t('models.available')}`)
          : providerConfig.enabled
            ? chalk.yellow(`○ ${t('models.enabledNotConnected')}`)
            : chalk.dim(`○ ${t('models.disabled')}`)

        console.log(chalk.bold(`${provider}`) + ` ${status}`)

        if (providerConfig.enabled && providerConfig.models.length > 0) {
          for (const model of providerConfig.models) {
            console.log(chalk.dim(`  - ${model.id}`))
          }
        }
        console.log()
      }

      console.log(chalk.bold(`${t('models.routing')}:`))
      console.log(`  ${t('models.strategy')}: ${modelsConfig.routing.strategy}`)
      console.log(`  ${t('models.fallbackChain')}: ${modelsConfig.routing.fallbackChain.join(' → ')}`)
      console.log()
    })

  cmd
    .command('sandbox')
    .description('Show sandbox configuration')
    .action(async () => {
      const sandbox = getSandbox()

      console.log(chalk.bold.cyan(`\n${t('sandbox.title')}\n`))
      console.log(`${t('sandbox.status')}: ${sandbox.isEnabled() ? chalk.green(t('sandbox.enabled')) : chalk.yellow(t('models.disabled'))}`)
      console.log()

      console.log(chalk.bold(`${t('sandbox.allowedPaths')}:`))
      for (const p of sandbox.getAllowedPaths()) {
        console.log(chalk.green(`  ✓ ${p}`))
      }
      console.log()

      console.log(chalk.bold(`${t('sandbox.blockedPatterns')}:`))
      for (const p of sandbox.getBlockedPaths()) {
        console.log(chalk.red(`  ✗ ${p}`))
      }
      console.log()
    })

  cmd
    .command('export')
    .description('Export configuration to JSON')
    .action(async () => {
      const settings = getSettingsStore()
      console.log(settings.export())
    })

  cmd
    .command('import <file>')
    .description('Import configuration from JSON file')
    .action(async (file: string) => {
      const fs = await import('node:fs')
      const settings = getSettingsStore()

      try {
        const content = await fs.promises.readFile(file, 'utf-8')
        settings.import(content)
        console.log(chalk.green(t('config.importSuccess')))
      } catch (error) {
        console.error(chalk.red(`${t('config.importFailed')}:`), error instanceof Error ? error.message : error)
      }
    })

  return cmd
}
