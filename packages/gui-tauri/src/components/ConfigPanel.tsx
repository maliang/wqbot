import React, { useState } from 'react'
import type { ConfigItem } from '../api'
import './ConfigPanel.css'

interface ConfigPanelProps {
  configs: ConfigItem[]
  onToggle: (type: ConfigItem['type'], name: string, enabled: boolean, scope: ConfigItem['scope']) => void
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({ configs, onToggle }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    rules: true,
    skills: true,
    agents: true
  })

  const groupedConfigs = {
    rules: configs.filter((c) => c.type === 'rules'),
    skills: configs.filter((c) => c.type === 'skills'),
    agents: configs.filter((c) => c.type === 'agents')
  }

  const sections = [
    { key: 'rules' as const, label: '规则', icon: '📋' },
    { key: 'skills' as const, label: '技能', icon: '⚡' },
    { key: 'agents' as const, label: '代理', icon: '🤖' }
  ]

  const toggleSection = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="config-panel">
      <div className="config-header">当前生效配置</div>

      <div className="config-content">
        {sections.map((section) => {
          const items = groupedConfigs[section.key]
          const enabledCount = items.filter((i) => i.enabled).length

          return (
            <div key={section.key} className="config-section">
              <div
                className="config-section-header"
                onClick={() => toggleSection(section.key)}
              >
                <div className="config-section-title">
                  <span className="config-section-icon">{section.icon}</span>
                  <span>{section.label}</span>
                  <span className="config-section-count">
                    {enabledCount}/{items.length}
                  </span>
                </div>
                <span
                  className={`config-section-toggle ${expanded[section.key] ? 'expanded' : ''}`}
                >
                  ▼
                </span>
              </div>

              {expanded[section.key] && (
                <div className="config-items">
                  {items.length === 0 ? (
                    <div className="empty-config">暂无{section.label}</div>
                  ) : (
                    items.map((item) => (
                      <div key={`${item.type}-${item.name}-${item.scope}`} className="config-item">
                        <input
                          type="checkbox"
                          className="config-checkbox"
                          checked={item.enabled}
                          onChange={(e) =>
                            onToggle(item.type, item.name, e.target.checked, item.scope)
                          }
                        />
                        <span className="config-name">{item.name}</span>
                        <span className={`config-scope ${item.scope}`}>
                          {item.scope === 'global' ? 'G' : 'P'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ConfigPanel
