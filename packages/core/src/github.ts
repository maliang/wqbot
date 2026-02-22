import { createModuleLogger } from './logger.js'

const logger = createModuleLogger('github-integration')

/**
 * GitHub issue classification result
 */
export interface IssueClassification {
  readonly labels: string[]
  readonly confidence: number
  readonly suggestedAssignee?: string
  readonly priority: 'low' | 'medium' | 'high' | 'critical'
}

/**
 * GitHub PR review result
 */
export interface PRReviewResult {
  readonly approved: boolean
  readonly comments: Array<{
    readonly path: string
    readonly line: number
    readonly body: string
    readonly severity: 'info' | 'warning' | 'error'
  }>
  readonly summary: string
}

/**
 * Label taxonomy for issue classification
 */
export const LABEL_TAXONOMY = {
  // Feature/Component labels
  feature: [
    'auth', 'cli', 'core', 'hooks', 'ide', 'knowledge',
    'mcp', 'models', 'plugins', 'skills', 'specs', 'ui',
  ],
  // OS-specific labels
  os: ['linux', 'mac', 'windows'],
  // Theme labels
  theme: [
    'performance', 'security', 'accessibility', 'i18n',
    'api', 'documentation', 'testing',
  ],
  // Workflow labels
  workflow: [
    'pending-triage', 'pending-response', 'duplicate',
    'question', 'wontfix', 'help-wanted',
  ],
  // Priority labels
  priority: ['priority-low', 'priority-medium', 'priority-high', 'priority-critical'],
}

/**
 * Classify a GitHub issue using AI
 */
export async function classifyIssue(
  title: string,
  body: string,
  classifyFn: (prompt: string) => Promise<string>
): Promise<IssueClassification> {
  const prompt = `Analyze this GitHub issue and classify it.

Title: ${title}
Body: ${body}

Return JSON with:
- labels: array of relevant labels from these categories:
  - Features: ${LABEL_TAXONOMY.feature.join(', ')}
  - OS: ${LABEL_TAXONOMY.os.join(', ')}
  - Theme: ${LABEL_TAXONOMY.theme.join(', ')}
  - Workflow: ${LABEL_TAXONOMY.workflow.join(', ')}
- confidence: 0-1 score
- priority: "low", "medium", "high", or "critical"

Only respond with valid JSON.`

  try {
    const response = await classifyFn(prompt)
    const result = JSON.parse(response) as IssueClassification
    
    logger.debug('Issue classified', { title, labels: result.labels })
    return result
  } catch (error) {
    logger.error('Failed to classify issue', error instanceof Error ? error : undefined)
    return {
      labels: ['pending-triage'],
      confidence: 0,
      priority: 'medium',
    }
  }
}

/**
 * Detect duplicate issues using semantic similarity
 */
export async function detectDuplicate(
  issueTitle: string,
  issueBody: string,
  existingIssues: Array<{ number: number; title: string; body: string }>,
  compareFn: (text1: string, text2: string) => Promise<number>
): Promise<Array<{ number: number; similarity: number }>> {
  const duplicates: Array<{ number: number; similarity: number }> = []
  const threshold = 0.80 // Similarity threshold

  for (const existing of existingIssues) {
    const similarity = await compareFn(
      `${issueTitle} ${issueBody}`,
      `${existing.title} ${existing.body}`
    )

    if (similarity >= threshold) {
      duplicates.push({ number: existing.number, similarity })
    }
  }

  // Sort by similarity descending
  duplicates.sort((a, b) => b.similarity - a.similarity)

  return duplicates.slice(0, 5) // Return top 5
}

/**
 * Generate PR review comments
 */
export async function reviewPR(
  diff: string,
  reviewFn: (prompt: string) => Promise<string>
): Promise<PRReviewResult> {
  const prompt = `Review this pull request diff and provide feedback.

Diff:
\`\`\`diff
${diff}
\`\`\`

Return JSON with:
- approved: boolean (true if changes look good)
- comments: array of { path, line, body, severity }
- summary: brief overall assessment

Focus on:
- Code quality and best practices
- Potential bugs or errors
- Security concerns
- Performance implications

Only respond with valid JSON.`

  try {
    const response = await reviewFn(prompt)
    const result = JSON.parse(response) as PRReviewResult
    
    logger.debug('PR reviewed', { approved: result.approved, comments: result.comments.length })
    return result
  } catch (error) {
    logger.error('Failed to review PR', error instanceof Error ? error : undefined)
    return {
      approved: false,
      comments: [],
      summary: 'Failed to generate review',
    }
  }
}

/**
 * Generate response for @wqbot mention
 */
export async function generateMentionResponse(
  context: {
    readonly type: 'issue' | 'pr' | 'comment'
    readonly number: number
    readonly title: string
    readonly body: string
    readonly author: string
  },
  generateFn: (prompt: string) => Promise<string>
): Promise<string> {
  const prompt = `You are WQBot, an AI assistant mentioned in a GitHub ${context.type}.

${context.type.toUpperCase()} #${context.number}: ${context.title}

By @${context.author}:
${context.body}

Provide a helpful, concise response. If this is a:
- Bug report: Suggest debugging steps or ask for more info
- Feature request: Discuss feasibility and alternatives
- Question: Provide a clear answer or point to documentation
- PR comment: Address the specific concern

Keep response under 500 characters when possible.`

  try {
    const response = await generateFn(prompt)
    logger.debug('Generated mention response', { type: context.type, number: context.number })
    return response
  } catch (error) {
    logger.error('Failed to generate mention response', error instanceof Error ? error : undefined)
    return 'Sorry, I encountered an error processing this request. Please try again later.'
  }
}

/**
 * GitHub webhook event handler
 */
export interface WebhookEvent {
  readonly action: string
  readonly issue?: {
    readonly number: number
    readonly title: string
    readonly body: string
    readonly user: { readonly login: string }
  }
  readonly pull_request?: {
    readonly number: number
    readonly title: string
    readonly body: string
    readonly diff_url?: string
    readonly user: { readonly login: string }
  }
  readonly comment?: {
    readonly body: string
    readonly user: { readonly login: string }
  }
  readonly repository: {
    readonly full_name: string
  }
}

/**
 * Process a GitHub webhook event
 */
export async function processWebhookEvent(
  event: WebhookEvent,
  handlers: {
    readonly classify: (title: string, body: string) => Promise<IssueClassification>
    readonly generate: (prompt: string) => Promise<string>
    readonly addLabels: (issueNumber: number, labels: string[]) => Promise<void>
    readonly addComment: (issueNumber: number, body: string) => Promise<void>
  }
): Promise<void> {
  const { action, issue, pull_request, comment, repository } = event

  // Handle new issue
  if (action === 'opened' && issue) {
    logger.info(`New issue: ${repository.full_name}#${issue.number}`)

    // Classify the issue
    const classification = await handlers.classify(issue.title, issue.body ?? '')

    // Add labels
    if (classification.labels.length > 0) {
      await handlers.addLabels(issue.number, classification.labels)
    }
  }

  // Handle @wqbot mention in issue or PR
  if (comment?.body.includes('@wqbot')) {
    const targetNumber = issue?.number ?? pull_request?.number
    if (targetNumber) {
      const response = await generateMentionResponse(
        {
          type: issue ? 'issue' : 'pr',
          number: targetNumber,
          title: issue?.title ?? pull_request?.title ?? '',
          body: comment.body,
          author: comment.user.login,
        },
        handlers.generate
      )
      await handlers.addComment(targetNumber, response)
    }
  }

  // Handle new PR
  if (action === 'opened' && pull_request) {
    logger.info(`New PR: ${repository.full_name}#${pull_request.number}`)
    // PR review would be triggered here if diff_url is available
  }
}
