import { tool, type CoreTool } from 'ai'
import { z } from 'zod'

// 内联类型定义，避免对 @wqbot/skills 的循环依赖
interface ToolResult {
  readonly content: string
  readonly isError?: boolean
}

interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>
  readonly source: 'mcp' | 'skill' | 'builtin'
  readonly execute: (args: Record<string, unknown>) => Promise<ToolResult>
}

// 将 JSON Schema 转换为 Zod schema（简化版，覆盖常见类型）
export function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType {
  const type = schema.type as string | undefined

  if (type === 'object') {
    const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>
    const required = (schema.required ?? []) as string[]
    const shape: Record<string, z.ZodType> = {}

    for (const [key, propSchema] of Object.entries(properties)) {
      let zodProp = jsonSchemaToZod(propSchema)
      if (!required.includes(key)) {
        zodProp = zodProp.optional() as z.ZodType
      }
      shape[key] = zodProp
    }

    return z.object(shape)
  }

  if (type === 'array') {
    const items = (schema.items ?? {}) as Record<string, unknown>
    return z.array(jsonSchemaToZod(items))
  }

  if (type === 'string') {
    let s = z.string()
    if (schema.enum) {
      return z.enum(schema.enum as [string, ...string[]])
    }
    if (schema.description) {
      s = s.describe(schema.description as string)
    }
    return s
  }

  if (type === 'number' || type === 'integer') {
    return z.number()
  }

  if (type === 'boolean') {
    return z.boolean()
  }

  // 兜底：接受任意值
  return z.any()
}

// 将通用 ToolDefinition[] 转换为 AI SDK tools Record
export function convertToAITools(
  tools: readonly ToolDefinition[]
): Record<string, CoreTool> {
  const result: Record<string, CoreTool> = {}

  for (const def of tools) {
    const parameters = jsonSchemaToZod(def.inputSchema) as z.ZodObject<z.ZodRawShape>

    result[def.name] = tool({
      description: def.description,
      parameters,
      execute: async (args: Record<string, unknown>): Promise<string> => {
        const toolResult: ToolResult = await def.execute(args)
        return toolResult.content
      },
    })
  }

  return result
}
