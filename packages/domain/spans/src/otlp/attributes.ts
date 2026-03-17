import type { OtlpKeyValue } from "./types.ts"

function findAttr(attrs: readonly OtlpKeyValue[], key: string) {
  return attrs.find((a) => a.key === key)
}

export function stringAttr(attrs: readonly OtlpKeyValue[], key: string): string | undefined {
  const v = findAttr(attrs, key)?.value?.stringValue
  return v || undefined
}

export function intAttr(attrs: readonly OtlpKeyValue[], key: string): number | undefined {
  const kv = findAttr(attrs, key)
  if (!kv?.value) return undefined
  if (kv.value.intValue !== undefined) return Number(kv.value.intValue)
  if (kv.value.doubleValue !== undefined) return Math.round(kv.value.doubleValue)
  return undefined
}

export function floatAttr(attrs: readonly OtlpKeyValue[], key: string): number | undefined {
  const kv = findAttr(attrs, key)
  if (!kv?.value) return undefined
  if (kv.value.doubleValue !== undefined) return kv.value.doubleValue
  if (kv.value.intValue !== undefined) return Number(kv.value.intValue)
  return undefined
}

export function stringArrayAttr(attrs: readonly OtlpKeyValue[], key: string): string[] | undefined {
  const kv = findAttr(attrs, key)
  if (!kv?.value?.arrayValue?.values) return undefined
  const values = kv.value.arrayValue.values
    .filter((v) => v.stringValue !== undefined)
    .map((v) => v.stringValue as string)
  return values.length > 0 ? values : undefined
}
