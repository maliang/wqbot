import React, { useState } from 'react'
import { Box, Text, useInput, useApp } from 'ink'
import TextInput from 'ink-text-input'
import { loadApiConfig, saveApiConfig } from '@wqbot/core'

type SetupStep = 'welcome' | 'provider' | 'apiKey' | 'model' | 'complete'

interface Provider {
  id: string
  name: string
  description: string
  requiresKey: boolean
  defaultModels: string[]
}

const PROVIDERS: Provider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, GPT-4, GPT-3.5 等',
    requiresKey: true,
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 4.5, Claude 3.5 等',
    requiresKey: true,
    defaultModels: ['claude-sonnet-4-5-20250514', 'claude-3-5-sonnet-20241022'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek Chat, DeepSeek Coder',
    requiresKey: true,
    defaultModels: ['deepseek-chat', 'deepseek-coder'],
  },
  {
    id: 'ollama',
    name: 'Ollama (本地)',
    description: '本地运行，无需 API Key',
    requiresKey: false,
    defaultModels: ['llama3', 'codellama', 'mistral'],
  },
]

interface SetupWizardProps {
  onComplete: () => void
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const { exit } = useApp()
  const [step, setStep] = useState<SetupStep>('welcome')
  const [selectedProvider, setSelectedProvider] = useState<number>(0)
  const [apiKey, setApiKey] = useState('')
  const [selectedModel, setSelectedModel] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)

  const currentProvider = PROVIDERS[selectedProvider]

  useInput((input, key) => {
    if (key.escape) {
      exit()
      return
    }

    if (step === 'welcome') {
      if (key.return) {
        setStep('provider')
      }
    } else if (step === 'provider') {
      if (key.upArrow) {
        setSelectedProvider((prev) => Math.max(0, prev - 1))
      } else if (key.downArrow) {
        setSelectedProvider((prev) => Math.min(PROVIDERS.length - 1, prev + 1))
      } else if (key.return) {
        if (currentProvider?.requiresKey) {
          setStep('apiKey')
        } else {
          setStep('model')
        }
      }
    } else if (step === 'model') {
      const models = currentProvider?.defaultModels || []
      if (key.upArrow) {
        setSelectedModel((prev) => Math.max(0, prev - 1))
      } else if (key.downArrow) {
        setSelectedModel((prev) => Math.min(models.length - 1, prev + 1))
      } else if (key.return) {
        saveConfig()
      }
    } else if (step === 'complete') {
      if (key.return) {
        onComplete()
      }
    }
  })

  const handleApiKeySubmit = (value: string) => {
    if (!value.trim()) {
      setError('请输入 API Key')
      return
    }
    setApiKey(value.trim())
    setError(null)
    setStep('model')
  }

  const saveConfig = async () => {
    try {
      const config = (await loadApiConfig()) as any
      const provider = currentProvider

      if (!provider) return

      // 使用新配置格式：providers.*
      const updatedConfig = {
        ...config,
        defaultProvider: provider.id,
        defaultModel: provider.defaultModels[selectedModel] || provider.defaultModels[0],
        providers: {
          ...config.providers,
          [provider.id]: {
            ...config.providers?.[provider.id],
            apiKey: apiKey || undefined,
            ...(provider.id === 'ollama' ? { host: 'http://localhost:11434' } : {}),
            ...(provider.id === 'deepseek' ? { baseUrl: 'https://api.deepseek.com' } : {}),
            models: provider.defaultModels,
          },
        },
      }

      await saveApiConfig(updatedConfig)
      setStep('complete')
    } catch (err) {
      setError(`保存配置失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* 标题 */}
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          ╔═══════════════════════════════════════════════════════════╗
        </Text>
      </Box>
      <Box>
        <Text color="cyan" bold>
          ║ WQBot 首次运行配置向导 ║
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          ╚═══════════════════════════════════════════════════════════╝
        </Text>
      </Box>

      {/* 欢迎页 */}
      {step === 'welcome' && (
        <Box flexDirection="column">
          <Text>欢迎使用 WQBot - 智能 AI 管家！</Text>
          <Text color="gray">这是您首次运行，需要进行一些基本配置。</Text>
          <Box marginTop={1}>
            <Text color="green">按 Enter 开始配置...</Text>
          </Box>
        </Box>
      )}

      {/* 选择提供商 */}
      {step === 'provider' && (
        <Box flexDirection="column">
          <Text bold>选择 AI 模型提供商：</Text>
          <Text color="gray" dimColor>
            使用 ↑↓ 选择，Enter 确认
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {PROVIDERS.map((provider, index) => (
              <Box key={provider.id}>
                <Text color={index === selectedProvider ? 'cyan' : 'white'}>
                  {index === selectedProvider ? '▸ ' : '  '}
                  {provider.name}
                </Text>
                <Text color="gray" dimColor>
                  {' '}
                  - {provider.description}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* 输入 API Key */}
      {step === 'apiKey' && currentProvider && (
        <Box flexDirection="column">
          <Text bold>输入 {currentProvider.name} API Key：</Text>
          <Text color="gray" dimColor>
            获取地址:{' '}
            {currentProvider.id === 'openai'
              ? 'https://platform.openai.com/api-keys'
              : currentProvider.id === 'anthropic'
                ? 'https://console.anthropic.com/settings/keys'
                : currentProvider.id === 'deepseek'
                  ? 'https://platform.deepseek.com/api_keys'
                  : ''}
          </Text>
          <Box marginTop={1}>
            <Text color="green">{'> '}</Text>
            <TextInput
              value={apiKey}
              onChange={setApiKey}
              onSubmit={handleApiKeySubmit}
              mask="*"
              placeholder="sk-..."
            />
          </Box>
          {error && (
            <Box marginTop={1}>
              <Text color="red">{error}</Text>
            </Box>
          )}
        </Box>
      )}

      {/* 选择默认模型 */}
      {step === 'model' && currentProvider && (
        <Box flexDirection="column">
          <Text bold>选择默认模型：</Text>
          <Text color="gray" dimColor>
            使用 ↑↓ 选择，Enter 确认
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {currentProvider.defaultModels.map((model, index) => (
              <Box key={model}>
                <Text color={index === selectedModel ? 'cyan' : 'white'}>
                  {index === selectedModel ? '▸ ' : '  '}
                  {model}
                </Text>
              </Box>
            ))}
          </Box>
          {error && (
            <Box marginTop={1}>
              <Text color="red">{error}</Text>
            </Box>
          )}
        </Box>
      )}

      {/* 完成 */}
      {step === 'complete' && currentProvider && (
        <Box flexDirection="column">
          <Text color="green" bold>
            ✓ 配置完成！
          </Text>
          <Box marginTop={1} flexDirection="column">
            <Text>提供商: {currentProvider.name}</Text>
            <Text>默认模型: {currentProvider.defaultModels[selectedModel]}</Text>
          </Box>
          <Box marginTop={1}>
            <Text color="cyan">按 Enter 开始使用 WQBot...</Text>
          </Box>
        </Box>
      )}

      {/* 底部提示 */}
      <Box marginTop={2}>
        <Text color="gray" dimColor>
          Esc 退出 | 配置保存在 ~/.wqbot/config.yaml
        </Text>
      </Box>
    </Box>
  )
}
