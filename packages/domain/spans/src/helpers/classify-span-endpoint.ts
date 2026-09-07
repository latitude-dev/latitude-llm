import type { Span } from "../entities/span.ts"
import type { SpanEndpointClassification } from "../entities/span-endpoint.ts"
import { classifyFinishReason } from "./classify-finish-reason.ts"
import { classifyProviderError } from "./classify-provider-error.ts"

export const classifySpanEndpoint = (span: Pick<Span, "errorType" | "finishReasons">): SpanEndpointClassification => ({
  finishReasons: span.finishReasons.map(classifyFinishReason),
  providerError: classifyProviderError(span.errorType),
})
