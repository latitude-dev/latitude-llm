import { stringAttr } from "../attributes.ts"
import type { OtlpKeyValue } from "../types.ts"
import { resolveMetadata, tagsCandidates } from "./enrichment.ts"
import {
  modelCandidates,
  providerCandidates,
  responseModelCandidates,
  sessionIdCandidates,
  userIdCandidates,
} from "./identity.ts"
import { operationCandidates } from "./operation.ts"
import { finishReasonsCandidates, responseIdCandidates } from "./response.ts"
import type { ResolvedUsage } from "./usage.ts"
import { resolveUsage } from "./usage.ts"
import { first } from "./utils.ts"

interface ResolvedAttributes extends ResolvedUsage {
  readonly operation: string
  readonly provider: string
  readonly model: string
  readonly responseModel: string
  readonly responseId: string
  readonly finishReasons: readonly string[]
  readonly sessionId: string
  readonly userId: string
  readonly tags: readonly string[]
  readonly metadata: Readonly<Record<string, string>>
  readonly errorType: string
}

export function resolveAttributes(spanAttrs: readonly OtlpKeyValue[], statusCode: string): ResolvedAttributes {
  const provider = first(providerCandidates, spanAttrs) ?? ""
  const model = first(modelCandidates, spanAttrs) ?? ""

  return {
    operation: first(operationCandidates, spanAttrs) ?? "unspecified",
    provider,
    model,
    responseModel: first(responseModelCandidates, spanAttrs) ?? "",
    ...resolveUsage({ attrs: spanAttrs, provider, model }),
    responseId: first(responseIdCandidates, spanAttrs) ?? "",
    finishReasons: first(finishReasonsCandidates, spanAttrs) ?? [],
    sessionId: first(sessionIdCandidates, spanAttrs) ?? "",
    userId: first(userIdCandidates, spanAttrs) ?? "",
    tags: first(tagsCandidates, spanAttrs) ?? [],
    metadata: resolveMetadata(spanAttrs),
    errorType: statusCode === "error" ? (stringAttr(spanAttrs, "error.type") ?? "") : "",
  }
}
