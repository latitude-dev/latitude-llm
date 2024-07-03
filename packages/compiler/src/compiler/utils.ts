import { createHash } from 'node:crypto'

import { QueryMetadata } from './types'

export function mergeMetadata(...metadata: QueryMetadata[]): QueryMetadata {
  const config = metadata.reduce((acc, m) => ({ ...acc, ...m.config }), {})
  const methods = metadata.reduce(
    (acc, m) => new Set([...acc, ...m.methods]),
    new Set<string>(),
  )

  const hashes = metadata.map((m) => m.sqlHash).filter(Boolean) as string[]
  let sqlHash = undefined
  if (hashes.length === 1) {
    sqlHash = hashes[0]
  } else if (hashes.length > 1) {
    const hash = createHash('sha256')
    for (const h of hashes) hash.update(h)
    sqlHash = hash.digest('hex')
  }

  const rawSqls = metadata.map((m) => m.rawSql).filter(Boolean)
  if (rawSqls.length > 1) {
    throw new Error('Cannot merge metadata with multiple rawSqls')
  }
  const rawSql = rawSqls[0]

  return {
    config,
    methods,
    rawSql,
    sqlHash,
  }
}

export function emptyMetadata(): QueryMetadata {
  return {
    config: {},
    methods: new Set<string>(),
    rawSql: undefined,
    sqlHash: undefined,
  }
}

export function isIterable(obj: unknown): obj is Iterable<unknown> {
  return (obj as Iterable<unknown>)?.[Symbol.iterator] !== undefined
}

export async function hasContent(iterable: Iterable<unknown>) {
  for await (const _ of iterable) {
    return true
  }
  return false
}
