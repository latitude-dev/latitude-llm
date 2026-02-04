import { readFile } from 'fs/promises'
import { resolve } from 'path'

import type { PromptLoader } from '../types'
import { normalizePromptPath } from '../utils/paths'

type FsPromptLoaderOptions = {
  root?: string
}

/** Creates a filesystem-based PromptLoader. */
export function fsPromptLoader({
  root = process.cwd(),
}: FsPromptLoaderOptions = {}): PromptLoader {
  return {
    async load(path: string) {
      const normalized = normalizePromptPath(path)
      const fullPath = resolve(root, normalized)
      try {
        const content = await readFile(fullPath, 'utf8')
        return { path: normalized, content }
      } catch {
        return undefined
      }
    },
  }
}
