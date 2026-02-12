import { Command } from 'commander'
import chalk from 'chalk'
import { t } from '@wqbot/core'
import { getConversationStore } from '@wqbot/storage'

export function historyCommand(): Command {
  const cmd = new Command('history')
    .description('Manage conversation history')

  cmd
    .command('list')
    .description('List recent conversations')
    .option('-n, --limit <number>', 'Number of conversations to show', '20')
    .action(async (options) => {
      const store = getConversationStore()
      const limit = parseInt(options.limit, 10)
      const conversations = store.listConversations(limit)

      if (conversations.length === 0) {
        console.log(chalk.yellow(t('cli.noConversations')))
        return
      }

      console.log(chalk.bold.cyan(`\n${t('history.title')}:\n`))

      for (const conv of conversations) {
        const msgCount = store.getMessageCount(conv.id)
        const date = conv.updatedAt.toLocaleDateString()
        const time = conv.updatedAt.toLocaleTimeString()

        console.log(chalk.bold(`  ${conv.title}`))
        console.log(chalk.dim(`    ID: ${conv.id}`))
        console.log(chalk.dim(`    ${t('chat.messages')}: ${msgCount} | ${t('chat.lastUpdated')}: ${date} ${time}`))
        console.log()
      }

      console.log(chalk.dim(t('history.showing', { count: conversations.length })))
      console.log(chalk.dim(t('history.continueHint')))
      console.log()
    })

  cmd
    .command('show <id>')
    .description('Show a conversation')
    .option('-n, --limit <number>', 'Number of messages to show', '50')
    .action(async (id: string, options) => {
      const store = getConversationStore()
      const conversation = store.getConversation(id)

      if (!conversation) {
        console.error(chalk.red(`${t('cli.conversationNotFound')}: ${id}`))
        return
      }

      const limit = parseInt(options.limit, 10)
      const messages = conversation.messages.slice(-limit)

      console.log(chalk.bold.cyan(`\n${conversation.title}\n`))
      console.log(chalk.dim(`ID: ${conversation.id}`))
      console.log(chalk.dim(`${t('chat.created')}: ${conversation.createdAt.toLocaleString()}`))
      console.log(chalk.dim(`${t('chat.lastUpdated')}: ${conversation.updatedAt.toLocaleString()}`))
      console.log()

      for (const msg of messages) {
        const role = msg.role === 'user' ? chalk.green(t('cli.you')) : chalk.cyan(t('cli.assistant'))
        const time = msg.timestamp.toLocaleTimeString()

        console.log(`${chalk.dim(time)} ${role}:`)
        console.log(`  ${msg.content}`)
        console.log()
      }

      if (conversation.messages.length > limit) {
        console.log(chalk.dim(t('chat.showingLast', { count: limit, total: conversation.messages.length })))
      }
    })

  cmd
    .command('search <query>')
    .description('Search conversation history')
    .option('-n, --limit <number>', 'Maximum results', '20')
    .action(async (query: string, options) => {
      const store = getConversationStore()
      const limit = parseInt(options.limit, 10)
      const results = store.search(query, limit)

      if (results.length === 0) {
        console.log(chalk.yellow(`${t('cli.searchNoResults')} "${query}"`))
        return
      }

      console.log(chalk.bold.cyan(`\n${t('skill.searchResults', { count: results.length })} "${query}":\n`))

      for (const result of results) {
        const date = result.timestamp.toLocaleDateString()
        const preview = result.content.slice(0, 100) + (result.content.length > 100 ? '...' : '')

        console.log(chalk.bold(`  ${result.conversationTitle}`))
        console.log(chalk.dim(`    ${date} | ${t('cli.conversationId')}: ${result.conversationId}`))
        console.log(`    ${preview}`)
        console.log()
      }
    })

  cmd
    .command('delete <id>')
    .description('Delete a conversation')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (id: string, options) => {
      const store = getConversationStore()
      const conversation = store.getConversation(id)

      if (!conversation) {
        console.error(chalk.red(`${t('cli.conversationNotFound')}: ${id}`))
        return
      }

      if (!options.yes) {
        console.log(chalk.yellow(t('history.deleteConfirm', { title: conversation.title })))
        console.log(chalk.dim(t('config.useYesToConfirm')))
        return
      }

      store.deleteConversation(id)
      console.log(chalk.green(`${t('history.deleteSuccess')}: ${conversation.title}`))
    })

  cmd
    .command('export <id>')
    .description('Export a conversation')
    .option('-f, --format <format>', 'Export format (json, md)', 'md')
    .option('-o, --output <file>', 'Output file (default: stdout)')
    .action(async (id: string, options) => {
      const store = getConversationStore()
      const conversation = store.getConversation(id)

      if (!conversation) {
        console.error(chalk.red(`${t('cli.conversationNotFound')}: ${id}`))
        return
      }

      const format = options.format as 'json' | 'md'
      const exported = store.export(id, format)

      if (options.output) {
        const fs = await import('node:fs')
        await fs.promises.writeFile(options.output, exported, 'utf-8')
        console.log(chalk.green(`${t('config.exportSuccess')}: ${options.output}`))
      } else {
        console.log(exported)
      }
    })

  cmd
    .command('clear')
    .description('Clear all conversation history')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (options) => {
      if (!options.yes) {
        console.log(chalk.yellow(t('history.clearConfirm')))
        console.log(chalk.dim(t('config.useYesToConfirm')))
        return
      }

      const store = getConversationStore()
      const conversations = store.listConversations(1000)

      for (const conv of conversations) {
        store.deleteConversation(conv.id)
      }

      console.log(chalk.green(t('history.clearSuccess', { count: conversations.length })))
    })

  cmd
    .command('stats')
    .description('Show conversation statistics')
    .action(async () => {
      const store = getConversationStore()
      const conversations = store.listConversations(1000)

      let totalMessages = 0
      let oldestDate: Date | null = null
      let newestDate: Date | null = null

      for (const conv of conversations) {
        totalMessages += store.getMessageCount(conv.id)

        if (!oldestDate || conv.createdAt < oldestDate) {
          oldestDate = conv.createdAt
        }
        if (!newestDate || conv.updatedAt > newestDate) {
          newestDate = conv.updatedAt
        }
      }

      console.log(chalk.bold.cyan(`\n${t('history.stats')}:\n`))
      console.log(`  ${t('history.totalConversations')}: ${conversations.length}`)
      console.log(`  ${t('history.totalMessages')}: ${totalMessages}`)

      if (oldestDate) {
        console.log(`  ${t('history.oldest')}: ${oldestDate.toLocaleDateString()}`)
      }
      if (newestDate) {
        console.log(`  ${t('history.mostRecent')}: ${newestDate.toLocaleDateString()}`)
      }

      if (conversations.length > 0) {
        const avgMessages = (totalMessages / conversations.length).toFixed(1)
        console.log(`  ${t('history.avgMessages')}: ${avgMessages}`)
      }

      console.log()
    })

  return cmd
}
