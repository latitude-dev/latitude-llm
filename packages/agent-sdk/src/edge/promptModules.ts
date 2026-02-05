import { AgentSdkError } from '../errors'
import type { PromptRegistryMap } from '../loaders/registryPromptLoader'
import { normalizePromptPath } from '../utils/paths'

export type PromptModuleValue =
  | string
  | { default: string }
  | (() => Promise<string | { default: string }>)

export type PromptModuleMap = Record<string, PromptModuleValue>

/** Resolves an import.meta.glob map into PromptL registry entries. */
export async function resolvePromptModules(
  modules: PromptModuleMap,
): Promise<PromptRegistryMap> {
  const entries: PromptRegistryMap = {}

  for (const [path, moduleValue] of Object.entries(modules)) {
    const normalized = normalizePromptPath(path)
    const content = await resolveModuleContent(path, moduleValue)
    entries[normalized] = content
  }

  return entries
}

async function resolveModuleContent(
  path: string,
  moduleValue: PromptModuleValue,
) {
  if (typeof moduleValue === 'string') return moduleValue

  if (typeof moduleValue === 'function') {
    const resolved = await moduleValue()
    return extractPromptContent(path, resolved)
  }

  if (moduleValue && typeof moduleValue === 'object') {
    return extractPromptContent(path, moduleValue)
  }

  throw new AgentSdkError(`Invalid prompt module: ${path}`)
}

function extractPromptContent(
  path: string,
  moduleValue: string | { default?: unknown },
) {
  if (typeof moduleValue === 'string') return moduleValue

  if (moduleValue && typeof moduleValue.default === 'string') {
    return moduleValue.default
  }

  throw new AgentSdkError(`Invalid prompt module: ${path}`)
}
