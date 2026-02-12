import React from 'react'
import type { ParallelTask } from '../api'
import './TaskProgress.css'

interface TaskProgressProps {
  tasks: ParallelTask[]
  onCancel: (id: string) => void
  onCancelAll: () => void
}

const TaskProgress: React.FC<TaskProgressProps> = ({
  tasks,
  onCancel,
  onCancelAll
}) => {
  const activeTasks = tasks.filter(
    (t) => t.status === 'pending' || t.status === 'running'
  )

  if (activeTasks.length === 0) {
    return null
  }

  const getStatusIcon = (status: ParallelTask['status']) => {
    switch (status) {
      case 'pending':
        return '○'
      case 'running':
        return '◐'
      case 'completed':
        return '✓'
      case 'cancelled':
        return '✗'
      case 'failed':
        return '✗'
    }
  }

  return (
    <div className="task-progress">
      <div className="task-header">
        <span className="task-title">并行任务 ({activeTasks.length})</span>
        {activeTasks.length > 1 && (
          <button className="btn btn-secondary cancel-all-btn" onClick={onCancelAll}>
            取消全部
          </button>
        )}
      </div>

      <div className="task-list">
        {activeTasks.map((task) => (
          <div key={task.id} className="task-item">
            <span className="task-id">#{task.id.slice(0, 4)}</span>
            <span className="task-name">{task.name}</span>
            <div className="task-progress-bar">
              <div className="progress-bar">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${task.progress}%` }}
                />
              </div>
            </div>
            <span className={`task-status ${task.status}`}>
              {getStatusIcon(task.status)}
            </span>
            <button
              className="task-cancel-btn"
              onClick={() => onCancel(task.id)}
            >
              取消
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default TaskProgress
