import { jsonSchema, tool, type Tool } from 'ai'

import { MissingToolHandlerError } from '../errors'
import type { ToolHandler, ToolHandlers } from '../types'

type PromptToolConfig = {
  name: string
  description?: string
  parameters?: Record<string, unknown>
}

function normalizePromptTools(tools: unknown): PromptToolConfig[] {
  if (!Array.isArray(tools)) return []

  return tools.flatMap((entry) => {
    if (typeof entry === 'string') {
      return [{ name: entry }]
    }

    if (!entry || typeof entry !== 'object') return []

    return Object.entries(entry as Record<string, unknown>).map(
      ([name, value]) => {
        const config = value as { description?: string; parameters?: unknown }
        return {
          name,
          description: config?.description,
          parameters:
            (config?.parameters as Record<string, unknown>) ?? undefined,
        }
      },
    )
  })
}

function isToolDefinition(handler: ToolHandler): handler is Tool {
  return (
    typeof handler === 'object' && handler !== null && 'inputSchema' in handler
  )
}

function toToolDefinition(
  config: PromptToolConfig,
  handler: ToolHandler,
): Tool {
  if (isToolDefinition(handler)) return handler

  const inputSchema = jsonSchema(
    config.parameters ?? {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  )

  return tool<Record<string, unknown>, unknown>({
    description: config.description,
    inputSchema: inputSchema as unknown as Tool['inputSchema'],
    execute: handler as (input: Record<string, unknown>) => unknown,
  })
}

/** Builds the tool set from prompt config and runtime handlers. */
export function buildToolSet(
  configTools: unknown,
  handlers: ToolHandlers,
): Record<string, Tool> {
  const toolConfigs = normalizePromptTools(configTools)
  const toolSet: Record<string, Tool> = {}

  for (const config of toolConfigs) {
    const handler = handlers[config.name]
    if (!handler) {
      throw new MissingToolHandlerError(
        `Missing tool handler for '${config.name}'`,
      )
    }

    toolSet[config.name] = toToolDefinition(config, handler)
  }

  return toolSet
}
