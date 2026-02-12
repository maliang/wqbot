import React, { useState, useEffect } from 'react'
import api from '../api'
import { useUpdater } from '../hooks/useUpdater'
import { getVersion } from '@tauri-apps/api/app'
import './Settings.css'

interface Provider {
  id: string
  name: string
  description: string
  requiresKey: boolean
  keyPlaceholder: string
  docsUrl: string
  models: string[]
}

const PROVIDERS: Provider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, GPT-4, GPT-3.5 等',
    requiresKey: true,
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 4.5, Claude 3.5 等',
    requiresKey: true,
    keyPlaceholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    models: ['claude-sonnet-4-5-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022']
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek Chat, DeepSeek Coder',
    requiresKey: true,
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    models: ['deepseek-chat', 'deepseek-coder']
  },
  {
    id: 'ollama',
    name: 'Ollama (本地)',
    description: '本地运行，无需 API Key',
    requiresKey: false,
    keyPlaceholder: '',
    docsUrl: 'https://ollama.ai/',
    models: ['llama3', 'codellama', 'mistral', 'qwen2']
  }
]

interface SettingsProps {
  onClose: () => void
}

const Settings: React.FC<SettingsProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'providers' | 'general'>('providers')
  const [appVersion, setAppVersion] = useState('')
  const [autoUpdate, setAutoUpdate] = useState(true)
  const { status: updateStatus, error: updateError, updateInfo, check: checkForUpdate, install: installUpdate } = useUpdater({ autoCheck: autoUpdate })
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [defaultProvider, setDefaultProvider] = useState('openai')
  const [defaultModel, setDefaultModel] = useState('gpt-4o')
  const [ollamaHost, setOllamaHost] = useState('http://localhost:11434')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 加载设置
  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion('unknown'))
  }, [])

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const result = await api.getSettings()
        if (result.success && result.data) {
          const data = result.data as Record<string, unknown>
          setDefaultProvider((data.defaultProvider as string) || 'openai')
          setDefaultModel((data.defaultModel as string) || 'gpt-4o')
          setOllamaHost((data.ollamaHost as string) || 'http://localhost:11434')

          // 加载 API Keys (已保存的会显示为 *****)
          const keys: Record<string, string> = {}
          for (const provider of PROVIDERS) {
            if (data[`${provider.id}ApiKey`]) {
              keys[provider.id] = '*****'
            }
          }
          setApiKeys(keys)
        }
      } catch (error) {
        console.error('加载设置失败:', error)
      }
    }

    loadSettings()
  }, [])

  // 保存设置
  const handleSave = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const settings: Record<string, unknown> = {
        defaultProvider,
        defaultModel,
        ollamaHost
      }

      // 只保存修改过的 API Keys (不是 *****)
      for (const [provider, key] of Object.entries(apiKeys)) {
        if (key && key !== '*****') {
          settings[`${provider}ApiKey`] = key
        }
      }

      await api.updateSettings(settings)
      setMessage({ type: 'success', text: '设置已保存' })

      // 3秒后清除消息
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage({ type: 'error', text: '保存失败: ' + (error instanceof Error ? error.message : '未知错误') })
    } finally {
      setSaving(false)
    }
  }

  const currentProvider = PROVIDERS.find(p => p.id === defaultProvider)

  return (
    <div className="settings-overlay">
      <div className="settings-modal">
        <div className="settings-header">
          <h2>设置</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="settings-tabs">
          <button
            className={`tab ${activeTab === 'providers' ? 'active' : ''}`}
            onClick={() => setActiveTab('providers')}
          >
            AI 模型
          </button>
          <button
            className={`tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            通用设置
          </button>
        </div>

        <div className="settings-content">
          {activeTab === 'providers' && (
            <div className="providers-settings">
              {/* 默认提供商选择 */}
              <div className="setting-group">
                <label>默认 AI 提供商</label>
                <select
                  value={defaultProvider}
                  onChange={(e) => {
                    setDefaultProvider(e.target.value)
                    const provider = PROVIDERS.find(p => p.id === e.target.value)
                    if (provider && provider.models[0]) {
                      setDefaultModel(provider.models[0])
                    }
                  }}
                >
                  {PROVIDERS.map(provider => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} - {provider.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* 默认模型选择 */}
              {currentProvider && (
                <div className="setting-group">
                  <label>默认模型</label>
                  <select
                    value={defaultModel}
                    onChange={(e) => setDefaultModel(e.target.value)}
                  >
                    {currentProvider.models.map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                </div>
              )}

              <hr />

              {/* API Keys 配置 */}
              <h3>API Keys</h3>
              <p className="hint">配置各提供商的 API Key，CLI 和 GUI 共享这些设置。</p>

              {PROVIDERS.filter(p => p.requiresKey).map(provider => (
                <div key={provider.id} className="setting-group">
                  <label>
                    {provider.name} API Key
                    <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer" className="docs-link">
                      获取
                    </a>
                  </label>
                  <input
                    type="password"
                    placeholder={provider.keyPlaceholder}
                    value={apiKeys[provider.id] || ''}
                    onChange={(e) => setApiKeys({ ...apiKeys, [provider.id]: e.target.value })}
                  />
                </div>
              ))}

              {/* Ollama 配置 */}
              <div className="setting-group">
                <label>
                  Ollama 服务地址
                  <a href="https://ollama.ai/" target="_blank" rel="noopener noreferrer" className="docs-link">
                    安装
                  </a>
                </label>
                <input
                  type="text"
                  placeholder="http://localhost:11434"
                  value={ollamaHost}
                  onChange={(e) => setOllamaHost(e.target.value)}
                />
                <p className="hint">本地运行 Ollama，无需 API Key</p>
              </div>
            </div>
          )}

          {activeTab === 'general' && (
            <div className="general-settings">
              <div className="setting-group">
                <label>语言</label>
                <select defaultValue="zh-CN">
                  <option value="zh-CN">简体中文</option>
                  <option value="en">English</option>
                </select>
              </div>

              <div className="setting-group">
                <label>主题</label>
                <select defaultValue="dark">
                  <option value="dark">深色</option>
                  <option value="light">浅色</option>
                  <option value="system">跟随系统</option>
                </select>
              </div>

              <div className="setting-group">
                <label>Token 优化</label>
                <div className="checkbox-group">
                  <label className="checkbox">
                    <input type="checkbox" defaultChecked />
                    启用上下文压缩
                  </label>
                  <label className="checkbox">
                    <input type="checkbox" defaultChecked />
                    自动生成历史摘要
                  </label>
                </div>
              </div>

              <div className="setting-group">
                <label>对话窗口大小</label>
                <input type="number" defaultValue={20} min={5} max={100} />
                <p className="hint">保留最近的消息数量</p>
              </div>

              <hr />

              {/* 软件更新 */}
              <div className="setting-group">
                <label>软件更新</label>
                <p className="hint">当前版本: v{appVersion}</p>
                <div className="checkbox-group">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={autoUpdate}
                      onChange={(e) => setAutoUpdate(e.target.checked)}
                    />
                    自动检查更新
                  </label>
                </div>
                <div className="update-actions">
                  {(updateStatus === 'idle' || updateStatus === 'up-to-date') && (
                    <button className="btn btn-secondary" onClick={checkForUpdate}>
                      {updateStatus === 'up-to-date' ? '已是最新版本' : '检查更新'}
                    </button>
                  )}
                  {updateStatus === 'checking' && (
                    <button className="btn btn-secondary" disabled>
                      检查中...
                    </button>
                  )}
                  {updateStatus === 'available' && updateInfo && (
                    <div>
                      <p className="hint">发现新版本: v{updateInfo.version}</p>
                      <button className="btn btn-primary" onClick={installUpdate}>
                        下载并安装
                      </button>
                    </div>
                  )}
                  {updateStatus === 'downloading' && (
                    <button className="btn btn-secondary" disabled>
                      下载中...
                    </button>
                  )}
                  {updateStatus === 'error' && (
                    <div>
                      <p className="hint" style={{ color: 'var(--color-error, #e74c3c)' }}>
                        检查更新失败: {updateError}
                      </p>
                      <p className="hint">
                        请前往{' '}
                        <a href="https://github.com/user/wqbot/releases" target="_blank" rel="noopener noreferrer">
                          GitHub Releases
                        </a>{' '}
                        手动下载
                      </p>
                      <button className="btn btn-secondary" onClick={checkForUpdate}>
                        重试
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 消息提示 */}
        {message && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}

        <div className="settings-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Settings
