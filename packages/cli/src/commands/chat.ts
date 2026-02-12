import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import * as readline from 'node:readline'
import { getModelRouter } from '@wqbot/models'
import { getConversationStore } from '@wqbot/storage'
import { getSkillRegistry } from '@wqbot/skills'
import { getAuditLog } from '@wqbot/security'
import { t } from '@wqbot/core'
import type { ChatMessage } from '@wqbot/models'

interface ChatOptions {
  model?: string
  local?: boolean
  conversation?: string
}

export function chatCommand(): Command {
  const cmd = new Command('chat')
    .description('Start an interactive chat session')
    .option('-m, --model <model>', 'Specify model to use')
    .option('-l, --local', 'Use local models only')
    .option('-c, --conversation <id>', 'Continue a specific conversation')
    .option('-n, --new', 'Start a new conversation')
    .action(async (options: ChatOptions & { new?: boolean }) => {
      if (options.new) {
        await runInteractiveChat({ ...options, conversation: undefined })
      } else {
        await runInteractiveChat(options)
      }
    })

  return cmd
}

export async function runSingleMessage(message: string, options: ChatOptions): Promise<void> {
  const spinner = ora(t('cli.thinking')).start()

  try {
    const router = getModelRouter()
    const store = getConversationStore()
    const auditLog = getAuditLog()

    // Get or create conversation
    let conversationId = options.conversation
    if (!conversationId) {
      const conversation = store.createConversation()
      conversationId = conversation.id
    }

    // Add user message
    store.addMessage(conversationId, 'user', message)

    // Build messages for context
    const recentMessages = store.getRecentMessages(conversationId, 20)
    const chatMessages: ChatMessage[] = recentMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    // Get response
    const response = await router.chat(chatMessages, {
      preferredModel: options.model,
      localOnly: options.local,
    })

    spinner.stop()

    // Save assistant response
    store.addMessage(conversationId, 'assistant', response.content)

    // Log the interaction
    await auditLog.log({
      action: 'chat:message',
      success: true,
      details: {
        conversationId,
        model: response.model,
        promptTokens: response.usage?.promptTokens,
        completionTokens: response.usage?.completionTokens,
      },
    })

    // Print response
    console.log()
    console.log(chalk.cyan(`${t('cli.assistant')}:`))
    console.log(response.content)
    console.log()
    console.log(chalk.dim(`[${response.model}] ${t('cli.conversationId')}: ${conversationId}`))
  } catch (error) {
    spinner.stop()
    console.error(chalk.red(`${t('common.error')}:`), error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

export async function runInteractiveChat(options: ChatOptions): Promise<void> {
  const router = getModelRouter()
  const store = getConversationStore()
  const skillRegistry = getSkillRegistry()
  const auditLog = getAuditLog()

  // Get or create conversation
  let conversationId = options.conversation
  let conversation
  if (conversationId) {
    conversation = store.getConversation(conversationId)
    if (!conversation) {
      console.error(chalk.red(`${t('cli.conversationNotFound')}: ${conversationId}`))
      process.exit(1)
    }
  } else {
    conversation = store.createConversation()
    conversationId = conversation.id
  }

  console.log(chalk.bold.cyan(`\n🤖 ${t('cli.welcome')}\n`))
  console.log(chalk.dim(`${t('cli.conversationId')}: ${conversationId}`))
  console.log(chalk.dim(t('cli.exitHint')))
  console.log(chalk.dim(t('cli.helpHint')))
  console.log()

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const prompt = (): void => {
    rl.question(chalk.green(`${t('cli.you')}: `), async (input) => {
      const trimmedInput = input.trim()

      if (!trimmedInput) {
        prompt()
        return
      }

      // Handle exit
      if (trimmedInput.toLowerCase() === 'exit' || trimmedInput.toLowerCase() === 'quit') {
        console.log(chalk.cyan(`\n${t('cli.goodbye')} 👋\n`))
        rl.close()
        process.exit(0)
      }

      // Handle commands
      if (trimmedInput.startsWith('/')) {
        await handleCommand(trimmedInput, conversationId!, store, skillRegistry)
        prompt()
        return
      }

      // Regular chat message
      const spinner = ora(t('cli.thinking')).start()

      try {
        // Add user message
        store.addMessage(conversationId!, 'user', trimmedInput)

        // Build messages for context
        const recentMessages = store.getRecentMessages(conversationId!, 20)
        const chatMessages: ChatMessage[] = recentMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }))

        // Get response
        const response = await router.chat(chatMessages, {
          preferredModel: options.model,
          localOnly: options.local,
        })

        spinner.stop()

        // Save assistant response
        store.addMessage(conversationId!, 'assistant', response.content)

        // Log the interaction
        await auditLog.log({
          action: 'chat:message',
          success: true,
          details: {
            conversationId,
            model: response.model,
          },
        })

        // Print response
        console.log()
        console.log(chalk.cyan(`${t('cli.assistant')}:`), response.content)
        console.log(chalk.dim(`[${response.model}]`))
        console.log()
      } catch (error) {
        spinner.stop()
        console.error(chalk.red(`${t('common.error')}:`), error instanceof Error ? error.message : error)
        console.log()
      }

      prompt()
    })
  }

  prompt()
}

async function handleCommand(
  input: string,
  conversationId: string,
  store: ReturnType<typeof getConversationStore>,
  skillRegistry: ReturnType<typeof getSkillRegistry>
): Promise<void> {
  const [command, ...args] = input.slice(1).split(' ')

  switch (command?.toLowerCase()) {
    case 'help':
      console.log(chalk.cyan(`\n${t('common.help')}:`))
      console.log(`  /help          - ${t('cli.commands.help')}`)
      console.log(`  /clear         - ${t('cli.commands.clear')}`)
      console.log(`  /history       - ${t('cli.commands.history')}`)
      console.log(`  /new           - ${t('cli.commands.new')}`)
      console.log(`  /skills        - ${t('cli.commands.skills')}`)
      console.log(`  /export [format] - ${t('cli.commands.export')}`)
      console.log(`  /info          - ${t('cli.commands.info')}`)
      console.log()
      break

    case 'clear':
      console.clear()
      break

    case 'history':
      const messages = store.getMessages(conversationId)
      console.log(chalk.cyan(`\n${t('cli.commands.history')}:`))
      for (const msg of messages.slice(-10)) {
        const role = msg.role === 'user' ? chalk.green(t('cli.you')) : chalk.cyan(t('cli.assistant'))
        const time = msg.timestamp.toLocaleTimeString()
        console.log(`${chalk.dim(time)} ${role}: ${msg.content.slice(0, 100)}${msg.content.length > 100 ? '...' : ''}`)
      }
      console.log()
      break

    case 'new':
      const newConv = store.createConversation()
      console.log(chalk.cyan(`\n${t('chat.startNew')}: ${newConv.id}\n`))
      break

    case 'skills':
      const skills = skillRegistry.getAll()
      console.log(chalk.cyan(`\n${t('skill.available')}:`))
      if (skills.length === 0) {
        console.log(`  ${t('cli.noSkills')}`)
      } else {
        for (const skill of skills) {
          console.log(`  ${chalk.bold(skill.name)} v${skill.version} - ${skill.description}`)
        }
      }
      console.log()
      break

    case 'export':
      const format = (args[0] as 'json' | 'md') || 'md'
      const exported = store.export(conversationId, format)
      console.log(chalk.cyan(`\n${t('cli.commands.export')} (${format}):\n`))
      console.log(exported)
      break

    case 'info':
      const conv = store.getConversation(conversationId)
      const msgCount = store.getMessageCount(conversationId)
      console.log(chalk.cyan(`\n${t('cli.commands.info')}:`))
      console.log(`  ${t('cli.conversationId')} ID: ${conversationId}`)
      console.log(`  Title: ${conv?.title}`)
      console.log(`  ${t('chat.messages')}: ${msgCount}`)
      console.log(`  ${t('chat.created')}: ${conv?.createdAt.toLocaleString()}`)
      console.log()
      break

    default:
      console.log(chalk.yellow(`${t('common.unknown')}: ${command}`))
      console.log(chalk.dim(t('cli.helpHint')))
      console.log()
  }
}
