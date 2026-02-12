import React from 'react'
import { Box, Text } from 'ink'

interface ConfigItem {
  name: string
  type: 'rules' | 'skills' | 'agents'
  scope: 'global' | 'project'
  enabled: boolean
}

interface StatusBarProps {
  configs: ConfigItem[]
  model?: string
  conversationId?: string
}

export const StatusBar: React.FC<StatusBarProps> = ({
  configs,
  model,
  conversationId
}) => {
  const enabledConfigs = configs.filter((c) => c.enabled)

  const rules = enabledConfigs.filter((c) => c.type === 'rules')
  const skills = enabledConfigs.filter((c) => c.type === 'skills')
  const agents = enabledConfigs.filter((c) => c.type === 'agents')

  const renderConfigList = (items: ConfigItem[], label: string, color: string): React.ReactNode => {
    if (items.length === 0) return null

    return (
      <Box flexDirection="column" marginRight={2}>
        <Text color={color} bold>
          [{label}]
        </Text>
        {items.slice(0, 5).map((item) => (
          <Text key={`${item.type}-${item.name}-${item.scope}`} color="gray">
            {item.name} ({item.scope === 'global' ? 'G' : 'P'})
          </Text>
        ))}
        {items.length > 5 && (
          <Text color="gray" dimColor>
            +{items.length - 5} more
          </Text>
        )}
      </Box>
    )
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      marginBottom={1}
    >
      <Box justifyContent="space-between">
        <Box>
          <Text color="cyan" bold>
            WQBot
          </Text>
          {model && (
            <Text color="gray">
              {' '}
              | 模型: {model}
            </Text>
          )}
          {conversationId && (
            <Text color="gray" dimColor>
              {' '}
              | 对话: {conversationId.slice(0, 8)}
            </Text>
          )}
        </Box>
      </Box>

      {enabledConfigs.length > 0 && (
        <Box marginTop={1}>
          {renderConfigList(rules, 'rules', 'yellow')}
          {renderConfigList(skills, 'skills', 'green')}
          {renderConfigList(agents, 'agents', 'magenta')}
        </Box>
      )}
    </Box>
  )
}
