import { floatAttr, intAttr, stringArrayAttr, stringAttr } from "../attributes.ts"
import type { OtlpKeyValue } from "../types.ts"
import { modelCandidates, providerCandidates, responseModelCandidates } from "./identity.ts"
import { operationCandidates } from "./operation.ts"
import { finishReasonsCandidates, responseIdCandidates, sessionIdCandidates } from "./response.ts"
import type { ResolvedUsage } from "./usage.ts"
import { resolveUsage } from "./usage.ts"

export interface Candidate<T> {
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

interface ResolvedAttributes extends ResolvedUsage {
  readonly operation: string
  readonly provider: string
  readonly model: string
  readonly responseModel: string
  readonly responseId: string
  readonly finishReasons: readonly string[]
  readonly sessionId: string
  readonly errorType: string
}

export function resolveAttributes(spanAttrs: readonly OtlpKeyValue[], statusCode: string): ResolvedAttributes {
  const provider = first(providerCandidates, spanAttrs) ?? ""
  const model = first(modelCandidates, spanAttrs) ?? ""

  return {
    operation: first(operationCandidates, spanAttrs) ?? "",
    provider,
    model,
    responseModel: first(responseModelCandidates, spanAttrs) ?? "",
    ...resolveUsage({ attrs: spanAttrs, provider, model }),
    responseId: first(responseIdCandidates, spanAttrs) ?? "",
    finishReasons: first(finishReasonsCandidates, spanAttrs) ?? [],
    sessionId: first(sessionIdCandidates, spanAttrs) ?? "",
    errorType: statusCode === "error" ? (stringAttr(spanAttrs, "error.type") ?? "") : "",
  }
}
