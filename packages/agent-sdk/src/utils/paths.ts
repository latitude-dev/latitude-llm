import { resolveRelativePath } from '@latitude-data/constants'

/** Normalizes a prompt path to a .promptl relative path. */
export function normalizePromptPath(path: string): string {
  const trimmed = path.startsWith('/') ? path.slice(1) : path
  return trimmed.endsWith('.promptl') ? trimmed : `${trimmed}.promptl`
}

/** Resolves a prompt reference path relative to another prompt. */
export function resolvePromptPath(path: string, from?: string): string {
  return normalizePromptPath(resolveRelativePath(path, from))
}
