import React from 'react'
import { Box, Text } from 'ink'

interface WelcomeProps {
  version: string
}

export const Welcome: React.FC<WelcomeProps> = ({ version }) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="cyan" bold>
        ╔═══════════════════════════════════════════════════════════╗
      </Text>
      <Text color="cyan" bold>
        ║                                                           ║
      </Text>
      <Text color="cyan" bold>
        ║   WQBot - 智能 AI 管家                                    ║
      </Text>
      <Text color="cyan" bold>
        ║   v{version.padEnd(55)}║
      </Text>
      <Text color="cyan" bold>
        ║                                                           ║
      </Text>
      <Text color="cyan" bold>
        ╚═══════════════════════════════════════════════════════════╝
      </Text>
      <Box marginTop={1}>
        <Text color="gray">
          输入消息开始对话，或使用 /help 查看可用命令
        </Text>
      </Box>
    </Box>
  )
}
