import { AI, type AICredentialError, type AIError, formatGenAIMessage } from "@domain/ai"
import { OrganizationId, ProjectId, type RepositoryError, TraceId } from "@domain/shared"
import type { TraceResourceOutlierReason } from "@domain/spans"
import { TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import {
  SYSTEM_QUEUE_ANNOTATOR_MAX_TOKENS,
  SYSTEM_QUEUE_ANNOTATOR_MODEL,
  SYSTEM_QUEUE_DEFINITIONS,
} from "../constants.ts"
import { systemQueueAnnotatorOutputSchema } from "./system-queue-annotator-contracts.ts"

export interface RunSystemQueueAnnotatorInput {
  readonly organizationId: string
  readonly projectId: string
  readonly queueSlug: string
  readonly traceId: string
  readonly matchReasons?: readonly TraceResourceOutlierReason[]
}

export interface RunSystemQueueAnnotatorResult {
  readonly feedback: string
  readonly traceCreatedAt: string
}

export type RunSystemQueueAnnotatorError = RepositoryError | AIError | AICredentialError

const ANNOTATOR_SYSTEM_PROMPT_TEMPLATE = `
You are an annotation assistant reviewing LLM conversations for a specific quality queue.

Queue Name: {queueName}
Queue Description: {queueDescription}

Instructions for this queue:
{queueInstructions}

Your task is to review the full conversation below and provide structured feedback that explains why this conversation belongs in this queue. The feedback should be:
- Specific about what went wrong or what pattern was observed
- Actionable for someone reviewing the annotation later
- Neutral and descriptive in tone
- Focused on the underlying issue, not incidental details

You do NOT need to decide whether the conversation matches the queue — that has already been determined. Your job is only to draft the annotation text that explains the match.

Respond with structured data containing a single "feedback" field with your analysis.
`.trim()

const buildAnnotatorSystemPrompt = (queueSlug: string): string => {
  const queueDef = SYSTEM_QUEUE_DEFINITIONS.find((q) => q.slug === queueSlug)

  if (!queueDef) {
    return ANNOTATOR_SYSTEM_PROMPT_TEMPLATE.replace("{queueName}", queueSlug)
      .replace("{queueDescription}", "System queue for pattern detection")
      .replace("{queueInstructions}", "Review the conversation and provide feedback.")
  }

  return ANNOTATOR_SYSTEM_PROMPT_TEMPLATE.replace("{queueName}", queueDef.name)
    .replace("{queueDescription}", queueDef.description)
    .replace("{queueInstructions}", queueDef.instructions)
}

const formatConversationForAnnotator = (messages: readonly { role: string; parts: unknown[] }[]): string => {
  const blocks: string[] = []

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    const text = formatGenAIMessage(m as Parameters<typeof formatGenAIMessage>[0])
    const body = text || "<no plain text in this message>"
    blocks.push(`[message ${i}] role=${m.role}\n${body}`)
  }

  return blocks.join("\n\n---\n\n")
}

const formatMatchReasonsForAnnotator = (matchReasons: readonly TraceResourceOutlierReason[] | undefined): string => {
  if (!matchReasons || matchReasons.length === 0) {
    return "<no deterministic match reasons available>"
  }

  return matchReasons
    .map((reason, index) => {
      const values = Object.entries(reason.values)
        .map(([metric, value]) => `${metric}=${value}`)
        .join(", ")
      const thresholds = Object.entries(reason.thresholds)
        .map(([metric, value]) => `${metric}=${value}`)
        .join(", ")
      const medians = Object.entries(reason.medians)
        .map(([metric, value]) => `${metric}=${value}`)
        .join(", ")

      return [
        `[reason ${index}] key=${reason.key} metric=${reason.metric} mode=${reason.thresholdMode}`,
        values ? `values: ${values}` : undefined,
        thresholds ? `thresholds: ${thresholds}` : undefined,
        medians ? `medians: ${medians}` : undefined,
      ]
        .filter((part): part is string => Boolean(part))
        .join("\n")
    })
    .join("\n\n")
}

const loadTraceDetail = (input: RunSystemQueueAnnotatorInput) =>
  Effect.gen(function* () {
    const traceRepository = yield* TraceRepository

    return yield* traceRepository.findByTraceId({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      traceId: TraceId(input.traceId),
    })
  })

export const runSystemQueueAnnotatorUseCase = (input: RunSystemQueueAnnotatorInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("queue.organizationId", input.organizationId)
    yield* Effect.annotateCurrentSpan("queue.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("queue.traceId", input.traceId)
    yield* Effect.annotateCurrentSpan("queue.queueSlug", input.queueSlug)

    const ai = yield* AI

    const trace = yield* loadTraceDetail(input)

    const systemPrompt = buildAnnotatorSystemPrompt(input.queueSlug)

    const conversationText =
      trace.allMessages.length > 0
        ? formatConversationForAnnotator(trace.allMessages)
        : "<no conversation messages available>"

    const matchReasonText = formatMatchReasonsForAnnotator(input.matchReasons)

    const prompt = `Deterministic match context:\n\n${matchReasonText}\n\nFull conversation context:\n\n${conversationText}\n\nProvide your feedback analysis per the schema.`

    const result = yield* ai.generate({
      ...SYSTEM_QUEUE_ANNOTATOR_MODEL,
      maxTokens: SYSTEM_QUEUE_ANNOTATOR_MAX_TOKENS,
      system: systemPrompt,
      prompt,
      schema: systemQueueAnnotatorOutputSchema,
      telemetry: {
        spanName: "system-queue-annotator",
        tags: ["annotation-queue", "system-annotator"],
        metadata: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          traceId: input.traceId,
          queueSlug: input.queueSlug,
        },
      },
    })

    return {
      feedback: result.object.feedback,
      traceCreatedAt: trace.startTime.toISOString(),
    }
  }).pipe(Effect.withSpan("annotationQueues.runSystemQueueAnnotator"))
