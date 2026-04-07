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
