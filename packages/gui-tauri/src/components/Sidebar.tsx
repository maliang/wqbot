import React from 'react'
import type { Conversation } from '../api'
import './Sidebar.css'

interface SidebarProps {
  conversations: Conversation[]
  currentId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  onOpenSettings?: () => void
}

const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  currentId,
  onSelect,
  onCreate,
  onDelete,
  onOpenSettings
}) => {
  // 按日期分组
  const groupByDate = (convs: Conversation[]) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const groups: { label: string; items: Conversation[] }[] = [
      { label: '今天', items: [] },
      { label: '昨天', items: [] },
      { label: '更早', items: [] }
    ]

    for (const conv of convs) {
      const date = new Date(conv.createdAt)
      date.setHours(0, 0, 0, 0)

      if (date.getTime() === today.getTime()) {
        groups[0]?.items.push(conv)
      } else if (date.getTime() === yesterday.getTime()) {
        groups[1]?.items.push(conv)
      } else {
        groups[2]?.items.push(conv)
      }
    }

    return groups.filter((g) => g.items.length > 0)
  }

  const groups = groupByDate(conversations)

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <button className="btn btn-primary new-chat-btn" onClick={onCreate}>
          + 新对话
        </button>
      </div>

      <div className="sidebar-content">
        {groups.map((group) => (
          <div key={group.label} className="conversation-group">
            <div className="group-label">{group.label}</div>
            {group.items.map((conv) => (
              <div
                key={conv.id}
                className={`conversation-item ${currentId === conv.id ? 'active' : ''}`}
                onClick={() => onSelect(conv.id)}
              >
                <span className="conversation-title">
                  {conv.title || '新对话'}
                </span>
                <button
                  className="delete-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(conv.id)
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ))}

        {conversations.length === 0 && (
          <div className="empty-state">
            暂无对话记录
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <button className="btn-icon" onClick={onOpenSettings}>⚙️ 设置</button>
      </div>
    </div>
  )
}

export default Sidebar
