import {
  AI,
  AI_GENERATE_TELEMETRY_SPAN_NAMES,
  AI_GENERATE_TELEMETRY_TAGS,
  type AICredentialError,
  type AIError,
  buildProjectScopedAiMetadata,
  formatGenAIMessage,
} from "@domain/ai"
import { OrganizationId, ProjectId, type RepositoryError, TraceId } from "@domain/shared"
import { type TraceDetail, TraceRepository } from "@domain/spans"
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
  /**
   * Pre-generated score id for the draft annotation this LLM call will produce.
   *
   * Passed through `telemetry.metadata` on `ai.generate(...)`. Latitude's span
   * processor serializes it into the `latitude.metadata` JSON attribute on the
   * exported span, which the dogfood tenant sees as `metadata.scoreId` — the
   * filter key the product-feedback flow (see PRD: "Identity strategy") uses
   * to recover this trace later without a separate id field on the score row.
   */
  readonly scoreId: string
}

export interface RunSystemQueueAnnotatorResult {
  readonly feedback: string
  readonly traceCreatedAt: string
}

export type RunSystemQueueAnnotatorError = RepositoryError | AIError | AICredentialError

/**
 * Input for the pure annotator (no repository dependency).
 *
 * Callers that already hold a `TraceDetail` use this shape with
 * {@link annotateTraceForQueueUseCase}.
 */
export interface AnnotateTraceForQueueInput {
  readonly organizationId: string
  readonly projectId: string
  readonly queueSlug: string
  readonly traceId: string
  readonly scoreId: string
  readonly trace: TraceDetail
}

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

Use the simplest wording that still carries the full meaning. Prefer short, everyday words over formal or technical synonyms when both fit, and keep the feedback only as long as it needs to be — no padding, no restatement, no meta-commentary. The original context and nuance must still come through; simpler wording is the goal, not less information.

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

const loadTraceDetail = (input: RunSystemQueueAnnotatorInput) =>
  Effect.gen(function* () {
    const traceRepository = yield* TraceRepository

    return yield* traceRepository.findByTraceId({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      traceId: TraceId(input.traceId),
    })
  })

/**
 * Draft annotation feedback from an already-loaded trace.
 *
 * Pure annotator — no repository dependency, no data loading. Callers that
 * already hold a `TraceDetail` (eval harnesses, experiment runners) use this
 * directly; production paths use {@link runSystemQueueAnnotatorUseCase}, which
 * fetches the trace and delegates here.
 */
export const annotateTraceForQueueUseCase = Effect.fn("annotationQueues.annotateTraceForQueue")(function* (
  input: AnnotateTraceForQueueInput,
) {
  yield* Effect.annotateCurrentSpan("queue.organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("queue.projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("queue.traceId", input.traceId)
  yield* Effect.annotateCurrentSpan("queue.queueSlug", input.queueSlug)

  const ai = yield* AI

  const systemPrompt = buildAnnotatorSystemPrompt(input.queueSlug)

  const conversationText =
    input.trace.allMessages.length > 0
      ? formatConversationForAnnotator(input.trace.allMessages)
      : "<no conversation messages available>"

  const prompt = `Full conversation context:\n\n${conversationText}\n\nProvide your feedback analysis per the schema.`

  const result = yield* ai.generate({
    ...SYSTEM_QUEUE_ANNOTATOR_MODEL,
    maxTokens: SYSTEM_QUEUE_ANNOTATOR_MAX_TOKENS,
    system: systemPrompt,
    prompt,
    schema: systemQueueAnnotatorOutputSchema,
    telemetry: {
      spanName: AI_GENERATE_TELEMETRY_SPAN_NAMES.queueSystemDraft,
      tags: [...AI_GENERATE_TELEMETRY_TAGS.queueSystemDraft],
      metadata: buildProjectScopedAiMetadata(
        { organizationId: input.organizationId, projectId: input.projectId },
        { traceId: input.traceId, queueSlug: input.queueSlug, scoreId: input.scoreId },
      ),
    },
  })

  return {
    feedback: result.object.feedback,
    traceCreatedAt: input.trace.startTime.toISOString(),
  }
})

/**
 * Load the trace via the repository, then draft its annotation.
 *
 * Production entry point — used by the Temporal activity in
 * `systemQueueFlaggerWorkflow` after a match.
 */
export const runSystemQueueAnnotatorUseCase = Effect.fn("annotationQueues.runSystemQueueAnnotator")(function* (
  input: RunSystemQueueAnnotatorInput,
) {
  const trace = yield* loadTraceDetail(input)
  return yield* annotateTraceForQueueUseCase({ ...input, trace })
})
