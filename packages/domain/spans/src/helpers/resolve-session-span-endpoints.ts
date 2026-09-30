import type { GenAIMessage } from "rosetta-ai"
import type { Span } from "../entities/span.ts"
import type {
  ProviderErrorFinding,
  SessionGenerationEndpoint,
  SessionSpanEndpointResolution,
} from "../entities/span-endpoint.ts"
import { hasUsableAssistantCompletion } from "./assistant-output-content.ts"
import { classifySpanEndpoint } from "./classify-span-endpoint.ts"
import { isLlmCompletionOperation } from "./resolve-last-llm-completion-span.ts"

const NS_PER_MS = 1_000_000

const compareSpanChronology = (left: Span, right: Span): number => {
  const byEnd = left.endTime.getTime() - right.endTime.getTime()
  if (byEnd !== 0) return byEnd
  const byStart = left.startTime.getTime() - right.startTime.getTime()
  if (byStart !== 0) return byStart
  const byTraceId = right.traceId.localeCompare(left.traceId)
  return byTraceId !== 0 ? byTraceId : right.spanId.localeCompare(left.spanId)
}

const spanIdentity = (span: Pick<Span, "traceId" | "spanId">): string => `${span.traceId}:${span.spanId}`

const providerSubject = (provider: string): string => provider.trim().toLowerCase()

const isSuccessfulGeneration = (endpoint: SessionGenerationEndpoint, span: Span): boolean =>
  span.statusCode !== "error" &&
  endpoint.providerError === null &&
  endpoint.finishReasons.every((reason) => reason.classification === "clean")

const isAfterFailedGeneration = (candidate: SessionGenerationEndpoint, failed: SessionGenerationEndpoint): boolean =>
  candidate.startTime.getTime() >= failed.endTime.getTime()

export interface ResolveSessionSpanEndpointsInput {
  readonly spans: readonly Span[]
  readonly outputMessages: readonly GenAIMessage[]
}

export const resolveSessionSpanEndpoints = ({
  spans,
  outputMessages,
}: ResolveSessionSpanEndpointsInput): SessionSpanEndpointResolution => {
  const sortedSpans = [...spans].sort(compareSpanChronology)
  const spanIndices = new Map(sortedSpans.map((span, index) => [spanIdentity(span), index]))
  const generationSpans = sortedSpans.filter((span) => isLlmCompletionOperation(span.operation))

  const generationEndpoints = generationSpans.map((span, generationIndex): SessionGenerationEndpoint => {
    const classification = classifySpanEndpoint(span)
    return {
      traceId: span.traceId,
      spanId: span.spanId,
      spanIndex: spanIndices.get(spanIdentity(span))!,
      generationIndex,
      generationPosition: generationIndex === generationSpans.length - 1 ? "final" : "intermediate",
      startTime: span.startTime,
      endTime: span.endTime,
      provider: span.provider,
      model: span.model,
      ...classification,
    }
  })

  const spanByIdentity = new Map(generationSpans.map((span) => [spanIdentity(span), span]))
  const successfulEndpoints = generationEndpoints.filter((endpoint) => {
    const span = spanByIdentity.get(spanIdentity(endpoint))!
    return isSuccessfulGeneration(endpoint, span)
  })
  const hasUsableCompletion = hasUsableAssistantCompletion(outputMessages)

  const providerErrorFindings = generationEndpoints.flatMap((failed): ProviderErrorFinding[] => {
    if (failed.providerError?.classification !== "providerError") return []

    const laterSuccessfulEndpoints = successfulEndpoints.filter((candidate) =>
      isAfterFailedGeneration(candidate, failed),
    )
    const successful = laterSuccessfulEndpoints[0]
    const failedProvider = providerSubject(failed.provider)
    const sameSubjectSuccessful = failedProvider
      ? laterSuccessfulEndpoints.find((candidate) => providerSubject(candidate.provider) === failedProvider)
      : undefined
    const failedSpan = spanByIdentity.get(spanIdentity(failed))!
    const recovered = hasUsableCompletion && successful !== undefined
    const baseFinding = {
      traceId: failed.traceId,
      spanId: failed.spanId,
      generationPosition: failed.generationPosition,
      provider: failed.provider,
      model: failed.model,
      error: failed.providerError,
      failedSpanIndex: failed.spanIndex,
      costTotalMicrocents: failedSpan.costTotalMicrocents,
      observedDurationNs: Math.max(0, failed.endTime.getTime() - failed.startTime.getTime()) * NS_PER_MS,
    }

    if (recovered && sameSubjectSuccessful) {
      return [
        {
          ...baseFinding,
          recovered: true,
          sameSubjectRecovered: true,
          terminal: false,
          successfulSpanIndex: successful.spanIndex,
          sameSubjectSuccessfulSpanIndex: sameSubjectSuccessful.spanIndex,
        },
      ]
    }
    if (recovered) {
      return [
        {
          ...baseFinding,
          recovered: true,
          sameSubjectRecovered: false,
          terminal: false,
          successfulSpanIndex: successful.spanIndex,
        },
      ]
    }
    if (sameSubjectSuccessful) {
      return [
        {
          ...baseFinding,
          recovered: false,
          sameSubjectRecovered: true,
          terminal: true,
          successfulSpanIndex: successful!.spanIndex,
          sameSubjectSuccessfulSpanIndex: sameSubjectSuccessful.spanIndex,
        },
      ]
    }
    return [
      {
        ...baseFinding,
        recovered: false,
        sameSubjectRecovered: false,
        terminal: true,
        ...(successful ? { successfulSpanIndex: successful.spanIndex } : {}),
      },
    ]
  })

  return { generationEndpoints, providerErrorFindings }
}
