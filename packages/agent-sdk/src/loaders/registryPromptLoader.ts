import type { PromptLoader } from '../types'
import { normalizePromptPath } from '../utils/paths'

export type PromptRegistryMap = Record<string, string>

export type PromptRegistryRegisterOptions = {
  root?: string
}

export type PromptRegistryOptions = PromptRegistryRegisterOptions & {
  loader?: PromptLoader
}

export type PromptRegistry = PromptLoader & {
  register: (
    map: PromptRegistryMap,
    options?: PromptRegistryRegisterOptions,
  ) => void
}

type RegistryEntry = {
  path: string
  content: string
}

function normalizeRoot(root?: string) {
  if (!root) return undefined
  const trimmed = root.startsWith('/') ? root.slice(1) : root
  return trimmed.replace(/\/+$/, '')
}

function normalizeRegistryPath(path: string, root?: string) {
  const normalized = normalizePromptPath(path)
  if (!root) return normalized
  const prefix = root.endsWith('/') ? root : `${root}/`
  return normalized.startsWith(prefix)
    ? normalized.slice(prefix.length)
    : normalized
}

function loadRegistryEntry(
  registry: Map<string, string>,
  path: string,
): RegistryEntry | undefined {
  if (!registry.has(path)) return undefined
  return {
    path,
    content: registry.get(path) ?? '',
  }
}

/** Creates a registry-backed PromptLoader for Edge runtimes. */
export function createPromptRegistry(
  map: PromptRegistryMap = {},
  options: PromptRegistryOptions = {},
): PromptRegistry {
  const registry = new Map<string, string>()
  const fallbackLoader = options.loader

  const register = (
    entries: PromptRegistryMap,
    registerOptions: PromptRegistryRegisterOptions = {},
  ) => {
    const root = normalizeRoot(registerOptions.root ?? options.root)

    for (const [path, content] of Object.entries(entries)) {
      const normalized = normalizeRegistryPath(path, root)
      registry.set(normalized, content)
    }
  }

  register(map, options)

  return {
    async load(path: string) {
      const normalized = normalizePromptPath(path)
      const entry = loadRegistryEntry(registry, normalized)
      if (entry) return entry
      return fallbackLoader?.load(normalized)
    },
    register,
  }
}
