import { createAgentRuntime } from '../runtime/createAgentRuntime'
import { createPromptRegistry } from '../loaders/registryPromptLoader'
import type {
  PromptRegistryMap,
  PromptRegistryRegisterOptions,
} from '../loaders/registryPromptLoader'
import { resolvePromptModules, type PromptModuleMap } from './promptModules'
import type { RunAgentOptions } from '../types'

export { createAgentRuntime, createPromptRegistry, resolvePromptModules }
export * from '../errors'
export type {
  AgentRunResult,
  AgentRuntime,
  CreateAgentRuntimeOptions,
  PromptDocument,
  PromptLoader,
  RunAgentOptions,
  SecretsResolver,
  ToolExecute,
  ToolHandler,
  ToolHandlers,
} from '../types'
export type {
  PromptRegistry,
  PromptRegistryMap,
  PromptRegistryOptions,
  PromptRegistryRegisterOptions,
} from '../loaders/registryPromptLoader'
export type { PromptModuleMap } from './promptModules'

const defaultRegistry = createPromptRegistry()
const defaultRuntime = createAgentRuntime({
  loader: defaultRegistry,
  defaults: {
    model: resolveDefaultModel(),
  },
})

/** Registers PromptL content for the default Edge runtime. */
export function registerPrompts(
  map: PromptRegistryMap,
  options?: PromptRegistryRegisterOptions,
) {
  defaultRegistry.register(map, options)
}

/** Registers PromptL modules from import.meta.glob into the default registry. */
export async function registerPromptModules(
  modules: PromptModuleMap,
  options?: PromptRegistryRegisterOptions,
) {
  const map = await resolvePromptModules(modules)
  registerPrompts(map, options)
}

/** Runs a PromptL agent using the default Edge runtime. */
export async function runAgent(promptPath: string, options?: RunAgentOptions) {
  return defaultRuntime.run(promptPath, options)
}

function resolveDefaultModel() {
  if (typeof process === 'undefined') return undefined
  return process.env.LATITUDE_AGENT_MODEL
}
