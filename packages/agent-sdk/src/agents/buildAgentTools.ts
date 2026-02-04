import { jsonSchema, tool, type Tool } from 'ai'
import { scan } from 'promptl-ai'

import { PromptNotFoundError } from '../errors'
import type { PromptLoader, RunAgentOptions } from '../types'
import { resolvePromptPath } from '../utils/paths'

const JSON_SCHEMA_TYPES = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  object: 'object',
  integer: 'integer',
  array: 'array',
  null: 'null',
} as const

type AgentToolConfig = {
  name?: string
  description?: string
  parameters?: Record<string, { type?: string; description?: string }>
  schema?: Record<string, unknown>
}

type BuildAgentToolsOptions = {
  agentPaths: string[]
  loader: PromptLoader
  executeAgent: (
    path: string,
    options: RunAgentOptions,
  ) => Promise<{
    text: string
    output?: unknown
  }>
  modelOverride?: string
  tools?: RunAgentOptions['tools']
  signal?: AbortSignal
}

const MAX_TOOL_NAME_LENGTH = 64
const AGENT_TOOL_PREFIX = 'lat_agent'

function getAgentToolName(agentPath: string): string {
  const maxSuffixLength = MAX_TOOL_NAME_LENGTH - AGENT_TOOL_PREFIX.length - 1
  const suffix = agentPath
    .slice(Math.max(0, agentPath.length - maxSuffixLength))
    .replace(/\//g, '_')

  return `${AGENT_TOOL_PREFIX}_${suffix}`
}

async function buildAgentToolDefinition(
  agentPath: string,
  options: BuildAgentToolsOptions,
): Promise<{ name: string; tool: Tool }> {
  const normalized = resolvePromptPath(agentPath)
  const document = await options.loader.load(normalized)
  if (!document) {
    throw new PromptNotFoundError(`Agent prompt not found: ${normalized}`)
  }

  const metadata = await scan({
    prompt: document.content,
    fullPath: document.path,
    referenceFn: async (path: string, from?: string) => {
      const resolved = resolvePromptPath(path, from)
      const refDoc = await options.loader.load(resolved)
      return refDoc
        ? {
            path: refDoc.path,
            content: refDoc.content,
          }
        : undefined
    },
  })

  const config = metadata.config as AgentToolConfig
  const parameters = config.parameters ?? {}
  const properties = Object.fromEntries(
    Object.entries(parameters).map(([key, value]) => {
      const type =
        value.type && value.type in JSON_SCHEMA_TYPES
          ? JSON_SCHEMA_TYPES[value.type as keyof typeof JSON_SCHEMA_TYPES]
          : 'string'

      return [
        key,
        {
          type,
          description: value.description,
        },
      ]
    }),
  )

  metadata.parameters.forEach((param) => {
    if (param in properties) return
    properties[param] = { type: 'string', description: undefined }
  })

  const inputSchema = jsonSchema({
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  })

  const outputSchema = config.schema ? jsonSchema(config.schema) : undefined
  const toolName = config.name ?? getAgentToolName(document.path)

  return {
    name: toolName,
    tool: tool({
      description: config.description ?? 'An AI agent',
      inputSchema,
      outputSchema,
      execute: async (input) => {
        const result = await options.executeAgent(document.path, {
          model: options.modelOverride,
          parameters: input as Record<string, unknown>,
          tools: options.tools,
          signal: options.signal,
        })

        return result.output ?? result.text
      },
    }),
  }
}

/** Builds tool definitions for sub-agents. */
export async function buildAgentTools(
  options: BuildAgentToolsOptions,
): Promise<Record<string, Tool>> {
  const entries = await Promise.all(
    options.agentPaths.map((agentPath) =>
      buildAgentToolDefinition(agentPath, options),
    ),
  )

  return Object.fromEntries(
    entries.map(({ name, tool: agentTool }) => [name, agentTool]),
  )
}
