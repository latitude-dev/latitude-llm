import type { OtlpKeyValue } from "./types.ts"

export interface RedactConfig {
  attributes: string[]
  mask: string
}

export function parseRedactEnv(env: NodeJS.ProcessEnv): RedactConfig | undefined {
  const attributes = parseAttributesEnv(env.LATITUDE_REDACT_ATTRIBUTES)
  if (attributes.length === 0) return undefined
  return { attributes, mask: env.LATITUDE_REDACT_MASK ?? "******" }
}

export function redactAttributes(attributes: OtlpKeyValue[], config: RedactConfig | undefined): OtlpKeyValue[] {
  if (!config) return attributes
  const matchers = config.attributes.map(toMatcher).filter((matcher): matcher is (key: string) => boolean => !!matcher)
  if (matchers.length === 0) return attributes
  return attributes.map((attr) =>
    matchers.some((matches) => matches(attr.key)) ? redactedAttr(attr.key, config.mask) : attr,
  )
}

function parseAttributes(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "")
}

function parseAttributesEnv(value: string | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    const attributes = parseAttributes(parsed)
    if (attributes.length > 0) return attributes
  } catch {}
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "")
}

function toMatcher(pattern: string): ((key: string) => boolean) | undefined {
  if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
    const end = pattern.lastIndexOf("/")
    try {
      const regex = new RegExp(pattern.slice(1, end), pattern.slice(end + 1))
      return (key) => {
        regex.lastIndex = 0
        return regex.test(key)
      }
    } catch {
      return undefined
    }
  }
  try {
    const regex = new RegExp(pattern)
    return (key) => {
      regex.lastIndex = 0
      return key === pattern || regex.test(key)
    }
  } catch {
    return (key) => key === pattern
  }
}

function redactedAttr(key: string, mask: string): OtlpKeyValue {
  return { key, value: { stringValue: mask } }
}
