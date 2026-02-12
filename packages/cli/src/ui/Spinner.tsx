import React from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'

interface LoadingSpinnerProps {
  text?: string
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ text = '思考中...' }) => {
  return (
    <Box>
      <Text color="cyan">
        <Spinner type="dots" />
      </Text>
      <Text color="gray"> {text}</Text>
    </Box>
  )
}
