import { floatAttr, intAttr, stringArrayAttr, stringAttr } from "../attributes.ts"
import type { OtlpKeyValue } from "../types.ts"

export interface Candidate<T> {
  readonly resolve: (attrs: readonly OtlpKeyValue[]) => T | undefined
}

interface KeyedCandidate<T> {
  readonly key: string
  readonly resolve: (attrs: readonly OtlpKeyValue[]) => T | undefined
}

export function fromString<T = string>(key: string, transform?: (v: string) => T | undefined): Candidate<T> {
  return {
    resolve: (a) => {
      const v = stringAttr(a, key)
      if (v === undefined) return undefined
      return transform ? transform(v) : (v as T)
    },
  }
}

export function fromInt(key: string): Candidate<number> {
  return { resolve: (a) => intAttr(a, key) }
}

export function keyedFromInt(key: string): KeyedCandidate<number> {
  return { key, resolve: (a) => intAttr(a, key) }
}

export function fromFloat(key: string, transform?: (v: number) => number | undefined): Candidate<number> {
  return {
    resolve: (a) => {
      const v = floatAttr(a, key)
      if (v === undefined) return undefined
      return transform ? transform(v) : v
    },
  }
}

export function fromStringArray(key: string): Candidate<string[]> {
  return { resolve: (a) => stringArrayAttr(a, key) }
}

const ATTRIBUTES_PREFIX = "attributes."

/**
 * A source's flat metadata map adapted onto the attribute shape every candidate list here resolves
 * against.
 *
 * A trace import holds a `Record<string, unknown>` where a live span holds an attribute list, and the
 * candidates in this folder are written against the latter. Adapting the record is what lets an import
 * resolve by the same lists instead of restating their keys, which would be a second copy to keep in
 * step. An `attributes.` prefix is stripped on the way through: that is how Langfuse's OTLP export
 * nests the OTEL attributes, where Braintrust keeps them flat.
 *
 * Takes `unknown` so a caller can hand over a vendor payload it has not narrowed; anything that is
 * not a plain object holds no keys to resolve and yields no attributes.
 */
export function attrsFromMetadata(metadata: unknown): OtlpKeyValue[] {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) return []

  const attrs: OtlpKeyValue[] = []
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value !== "string") continue
    attrs.push({
      key: key.startsWith(ATTRIBUTES_PREFIX) ? key.slice(ATTRIBUTES_PREFIX.length) : key,
      value: { stringValue: value },
    })
  }
  return attrs
}

export function first<T>(candidates: readonly Candidate<T>[], attrs: readonly OtlpKeyValue[]): T | undefined {
  for (const c of candidates) {
    const v = c.resolve(attrs)
    if (v !== undefined) return v
  }
  return undefined
}

export function firstKeyed<T>(
  candidates: readonly KeyedCandidate<T>[],
  attrs: readonly OtlpKeyValue[],
): { key: string; value: T } | undefined {
  for (const c of candidates) {
    const v = c.resolve(attrs)
    if (v !== undefined) return { key: c.key, value: v }
  }
  return undefined
}
