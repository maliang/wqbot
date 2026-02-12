import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { t } from '@wqbot/core'
import { getSkillRegistry, getSkillMarketplace } from '@wqbot/skills'

export function skillCommand(): Command {
  const cmd = new Command('skill')
    .description('Manage WQBot skills')

  cmd
    .command('list')
    .description('List installed skills')
    .option('-a, --all', 'Show all details')
    .action(async (options) => {
      const registry = getSkillRegistry()
      const skills = registry.getAll()

      if (skills.length === 0) {
        console.log(chalk.yellow(t('cli.noSkills')))
        console.log(chalk.dim(t('skill.searchHint')))
        return
      }

      console.log(chalk.bold.cyan(`\n${t('skill.installed')}:\n`))

      for (const skill of skills) {
        console.log(chalk.bold(`  ${skill.name}`) + chalk.dim(` v${skill.version}`))
        console.log(chalk.dim(`    ${skill.description}`))

        if (options.all) {
          console.log(chalk.dim(`    ${t('skill.permissions')}: ${skill.requiredPermissions.join(', ') || t('common.none')}`))
          console.log(chalk.dim(`    ${t('skill.triggers')}: ${skill.manifest.triggers.examples.slice(0, 3).join(', ')}`))
        }
        console.log()
      }
    })

  cmd
    .command('search <query>')
    .description('Search for skills in the marketplace')
    .option('-s, --source <source>', 'Search specific source (skills.sh, npm, github)')
    .action(async (query: string, options) => {
      const spinner = ora(t('skill.search')).start()

      try {
        const marketplace = getSkillMarketplace()
        const sources = options.source ? [options.source] : undefined
        const results = await marketplace.search(query, sources)

        spinner.stop()

        if (results.length === 0) {
          console.log(chalk.yellow(`${t('cli.searchNoResults')} "${query}"`))
          return
        }

        console.log(chalk.bold.cyan(`\n${t('skill.searchResults', { count: results.length })}:\n`))

        for (const skill of results) {
          console.log(chalk.bold(`  ${skill.name}`) + chalk.dim(` v${skill.version}`))
          console.log(chalk.dim(`    ${skill.description}`))
          console.log(chalk.dim(`    Source: ${skill.source} | Install: wqbot skill install ${skill.uri}`))
          if (skill.downloads) {
            console.log(chalk.dim(`    Downloads: ${skill.downloads.toLocaleString()}`))
          }
          console.log()
        }
      } catch (error) {
        spinner.stop()
        console.error(chalk.red(`${t('common.error')}:`), error instanceof Error ? error.message : error)
      }
    })

  cmd
    .command('install <uri>')
    .description('Install a skill from URI')
    .action(async (uri: string) => {
      const spinner = ora(t('skill.installing', { name: uri })).start()

      try {
        const marketplace = getSkillMarketplace()
        await marketplace.install(uri)

        spinner.succeed(chalk.green(`${t('skill.installSuccess')}: ${uri}`))
      } catch (error) {
        spinner.fail(chalk.red(t('skill.installFailed')))
        console.error(error instanceof Error ? error.message : error)
      }
    })

  cmd
    .command('uninstall <name>')
    .description('Uninstall a skill')
    .action(async (name: string) => {
      const spinner = ora(t('skill.uninstalling', { name })).start()

      try {
        const marketplace = getSkillMarketplace()
        await marketplace.uninstall(name)

        spinner.succeed(chalk.green(`${t('skill.uninstallSuccess')}: ${name}`))
      } catch (error) {
        spinner.fail(chalk.red(t('skill.uninstallFailed')))
        console.error(error instanceof Error ? error.message : error)
      }
    })

  cmd
    .command('update [name]')
    .description('Update a skill (or all skills if no name provided)')
    .action(async (name?: string) => {
      const marketplace = getSkillMarketplace()

      if (name) {
        const spinner = ora(t('skill.updating', { name })).start()
        try {
          await marketplace.update(name)
          spinner.succeed(chalk.green(`${t('skill.updateSuccess')}: ${name}`))
        } catch (error) {
          spinner.fail(chalk.red(t('skill.updateFailed')))
          console.error(error instanceof Error ? error.message : error)
        }
      } else {
        const installed = await marketplace.listInstalled()
        console.log(chalk.cyan(`${t('skill.updating', { name: t('common.all') })} (${installed.length})...\n`))

        for (const skill of installed) {
          const spinner = ora(t('skill.updating', { name: skill.name })).start()
          try {
            await marketplace.update(skill.name)
            spinner.succeed(chalk.green(`${t('skill.updateSuccess')}: ${skill.name}`))
          } catch (error) {
            spinner.fail(chalk.red(`${t('skill.updateFailed')}: ${skill.name}`))
          }
        }
      }
    })

  cmd
    .command('create <name>')
    .description('Create a new skill from template')
    .option('-t, --template <template>', 'Template to use (basic, advanced)', 'basic')
    .action(async (name: string, options) => {
      const spinner = ora(t('skill.creating', { name })).start()

      try {
        const marketplace = getSkillMarketplace()
        const path = await marketplace.create(name, options.template)

        spinner.succeed(chalk.green(`${t('skill.createSuccess')}: ${path}`))
        console.log()
        console.log(chalk.dim(`${t('skill.nextSteps')}:`))
        console.log(chalk.dim(`  1. cd ${path}`))
        console.log(chalk.dim('  2. Edit index.ts to implement your skill'))
        console.log(chalk.dim('  3. Run "wqbot skill install ." to test'))
      } catch (error) {
        spinner.fail(chalk.red(t('skill.createFailed')))
        console.error(error instanceof Error ? error.message : error)
      }
    })

  cmd
    .command('info <name>')
    .description('Show detailed information about a skill')
    .action(async (name: string) => {
      const registry = getSkillRegistry()
      const skill = registry.get(name)

      if (!skill) {
        console.error(chalk.red(`${t('cli.skillNotFound')}: ${name}`))
        return
      }

      console.log(chalk.bold.cyan(`\n${skill.name}\n`))
      console.log(`Version: ${skill.version}`)
      console.log(`Description: ${skill.description}`)
      console.log()
      console.log(chalk.bold(`${t('skill.triggers')}:`))
      console.log(`  Patterns: ${skill.manifest.triggers.patterns.join(', ')}`)
      console.log(`  Examples: ${skill.manifest.triggers.examples.join(', ')}`)
      console.log(`  Priority: ${skill.manifest.triggers.priority}`)
      console.log()
      console.log(chalk.bold(`${t('skill.permissions')}:`))
      if (skill.requiredPermissions.length === 0) {
        console.log(`  ${t('skill.noneRequired')}`)
      } else {
        for (const perm of skill.requiredPermissions) {
          console.log(`  - ${perm}`)
        }
      }
      console.log()
      console.log(chalk.bold(`${t('skill.platforms')}:`))
      console.log(`  ${skill.manifest.platforms.join(', ')}`)
      console.log()
    })

  return cmd
}
