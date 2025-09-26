import { z, ZodSafeParseError } from 'zod'

type ErrorTree = {
  errors: string[]
  properties?: Record<string, ErrorTree>
  items?: (ErrorTree | undefined)[]
}

// Recursively map schema T into error strings
type FlattenErrorTree<T> = T extends object
  ? { [K in keyof T]?: FlattenErrorTree<T[K]> | string }
  : string

export function flattenErrors<T>(
  error: ZodSafeParseError<T>,
): FlattenErrorTree<T> {
  const tree = z.treeifyError(error.error) as ErrorTree

  function walk<U>(node: ErrorTree): FlattenErrorTree<U> {
    if (node.properties) {
      const result = {} as FlattenErrorTree<U>
      const entries = Object.entries(node.properties) as [
        Extract<keyof U, string>,
        ErrorTree | undefined,
      ][]

      for (const [key, child] of entries) {
        if (child) {
          ;(result as Record<string, unknown>)[key] = walk(child)
        }
      }
      return result
    }

    return (node.errors[0] ?? '') as FlattenErrorTree<U>
  }

  return walk<T>(tree)
}
