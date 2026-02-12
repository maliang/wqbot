import React from 'react'
import { Box, Text } from 'ink'

interface MessageProps {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: Date
}

export const Message: React.FC<MessageProps> = ({ role, content, timestamp }) => {
  const roleColors = {
    user: 'green',
    assistant: 'cyan',
    system: 'yellow'
  } as const

  const roleLabels = {
    user: '你',
    assistant: 'AI',
    system: '系统'
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={roleColors[role]} bold>
          {roleLabels[role]}
        </Text>
        {timestamp && (
          <Text color="gray" dimColor>
            {' '}
            {timestamp.toLocaleTimeString()}
          </Text>
        )}
      </Box>
      <Box marginLeft={2}>
        <Text wrap="wrap">{content}</Text>
      </Box>
    </Box>
  )
}

interface StreamingMessageProps {
  content: string
  isComplete: boolean
}

export const StreamingMessage: React.FC<StreamingMessageProps> = ({
  content,
  isComplete
}) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="cyan" bold>
          AI
        </Text>
        {!isComplete && (
          <Text color="gray" dimColor>
            {' '}
            (输入中...)
          </Text>
        )}
      </Box>
      <Box marginLeft={2}>
        <Text wrap="wrap">{content || ' '}</Text>
        {!isComplete && <Text color="cyan">▌</Text>}
      </Box>
    </Box>
  )
}
