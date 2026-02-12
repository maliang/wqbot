import React, { useState, useCallback } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'

interface InputBoxProps {
  onSubmit: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

export const InputBox: React.FC<InputBoxProps> = ({
  onSubmit,
  placeholder = '输入消息...',
  disabled = false
}) => {
  const [value, setValue] = useState('')

  const handleSubmit = useCallback(
    (input: string) => {
      if (input.trim() && !disabled) {
        onSubmit(input.trim())
        setValue('')
      }
    },
    [onSubmit, disabled]
  )

  return (
    <Box borderStyle="round" borderColor={disabled ? 'gray' : 'cyan'} paddingX={1}>
      <Text color="green" bold>
        {'> '}
      </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder={disabled ? '请等待...' : placeholder}
      />
    </Box>
  )
}

interface MultilineInputProps {
  onSubmit: (value: string) => void
  onCancel?: () => void
  placeholder?: string
}

export const MultilineInput: React.FC<MultilineInputProps> = ({
  onSubmit,
  onCancel,
  placeholder = '输入内容 (Ctrl+D 提交, Esc 取消)...'
}) => {
  const [lines, setLines] = useState<string[]>([''])
  const [currentLine, setCurrentLine] = useState(0)

  useInput((input, key) => {
    if (key.ctrl && input === 'd') {
      // Ctrl+D 提交
      const content = lines.join('\n').trim()
      if (content) {
        onSubmit(content)
        setLines([''])
        setCurrentLine(0)
      }
    } else if (key.escape) {
      // Esc 取消
      onCancel?.()
      setLines([''])
      setCurrentLine(0)
    } else if (key.return) {
      // Enter 换行
      const newLines = [...lines]
      newLines.splice(currentLine + 1, 0, '')
      setLines(newLines)
      setCurrentLine(currentLine + 1)
    } else if (key.upArrow && currentLine > 0) {
      setCurrentLine(currentLine - 1)
    } else if (key.downArrow && currentLine < lines.length - 1) {
      setCurrentLine(currentLine + 1)
    }
  })

  const handleLineChange = (value: string): void => {
    const newLines = [...lines]
    newLines[currentLine] = value
    setLines(newLines)
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="gray" dimColor>
        {placeholder}
      </Text>
      {lines.map((line, index) => (
        <Box key={index}>
          <Text color={index === currentLine ? 'green' : 'gray'}>
            {index === currentLine ? '> ' : '  '}
          </Text>
          {index === currentLine ? (
            <TextInput value={line} onChange={handleLineChange} />
          ) : (
            <Text>{line}</Text>
          )}
        </Box>
      ))}
    </Box>
  )
}
