import React from 'react'
import { Box, Text } from 'ink'

interface Task {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed'
  progress: number
}

interface TaskPanelProps {
  tasks: Task[]
  onCancel?: (taskId: string) => void
}

const ProgressBar: React.FC<{ progress: number; width?: number }> = ({
  progress,
  width = 20
}) => {
  const filled = Math.round((progress / 100) * width)
  const empty = width - filled

  return (
    <Text>
      <Text color="cyan">{'█'.repeat(filled)}</Text>
      <Text color="gray">{'░'.repeat(empty)}</Text>
      <Text color="gray"> {progress}%</Text>
    </Text>
  )
}

const StatusIcon: React.FC<{ status: Task['status'] }> = ({ status }) => {
  switch (status) {
    case 'pending':
      return <Text color="gray">○</Text>
    case 'running':
      return <Text color="cyan">◐</Text>
    case 'completed':
      return <Text color="green">✓</Text>
    case 'cancelled':
      return <Text color="yellow">✗</Text>
    case 'failed':
      return <Text color="red">✗</Text>
  }
}

export const TaskPanel: React.FC<TaskPanelProps> = ({ tasks }) => {
  const activeTasks = tasks.filter(
    (t) => t.status === 'pending' || t.status === 'running'
  )

  if (activeTasks.length === 0) {
    return null
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      marginTop={1}
    >
      <Text color="gray" bold>
        [并行任务]
      </Text>
      {activeTasks.map((task) => (
        <Box key={task.id} marginTop={1}>
          <Text color="gray">#{task.id.slice(0, 4)} </Text>
          <Text>{task.name} </Text>
          <ProgressBar progress={task.progress} width={15} />
          <Text> </Text>
          <StatusIcon status={task.status} />
        </Box>
      ))}
    </Box>
  )
}
