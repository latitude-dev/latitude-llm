import type { Tool, ToolCallOptions } from 'ai'

export type PromptDocument = {
  path: string
  content: string
}

export type PromptLoader = {
  load: (path: string) => Promise<PromptDocument | undefined>
}

export type ToolExecute = (
  input: Record<string, unknown>,
  options: ToolCallOptions,
) => Promise<unknown> | unknown

export type ToolHandler = ToolExecute | Tool

export type ToolHandlers = Record<string, ToolHandler>

export type RunAgentOptions = {
  model?: string
  parameters?: Record<string, unknown>
  tools?: ToolHandlers
  agents?: string[]
  maxSteps?: number
  stream?: boolean
  signal?: AbortSignal
}

export type AgentRunResult = {
  text: string
  output?: unknown
}

export type SecretsResolver = (input: {
  provider: string
  model: string
  modelId: string
}) => Promise<string | undefined> | string | undefined

export type CreateAgentRuntimeOptions = {
  loader: PromptLoader
  secrets?: SecretsResolver
  tools?: ToolHandlers
  defaults?: {
    model?: string
    maxSteps?: number
  }
}

export type AgentRuntime = {
  run: (
    path: string,
    options?: RunAgentOptions,
  ) => Promise<AgentRunResult | unknown>
  agent: (path: string) => {
    run: (options?: RunAgentOptions) => Promise<AgentRunResult | unknown>
    stream: (options?: RunAgentOptions) => Promise<unknown>
  }
  registerTools: (handlers: ToolHandlers) => void
  registerAgents: (paths: string[]) => void
}
