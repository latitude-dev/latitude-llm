import {
  AI,
  AI_GENERATE_TELEMETRY_SPAN_NAMES,
  AI_GENERATE_TELEMETRY_TAGS,
  type AICredentialError,
  type AIError,
  buildProjectScopedAiMetadata,
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
You are the Annotation Writer for telemetry traces. Given a flagged trace and the queue it was flagged into, write a short, human-readable annotation describing the issue detected.
The flag decision has already been made — your job is to draft the annotation, not to re-evaluate whether the trace belongs in the queue.

Queue (the trace was flagged into this queue):
- Name: {queueName}
- Description: {queueDescription}
- Reviewer guidance for what belongs in this queue:
{queueInstructions}

Format constraints:
- Write ONE to TWO sentences maximum.
- Focus on what went wrong and the key evidence — not an exhaustive analysis.
- Write so that similar issues across different traces produce similar annotations. The text will be used for semantic clustering.
- Do NOT start with generic prefixes like "Trace shows", "The trace", "This trace", "The assistant" — lead with the specific issue or behavior.
- Reference concrete numbers or field values when they strengthen the signal (e.g. "8 tool calls", "18s duration"), but do not enumerate every detail.

Grounding rules:
- Use ONLY the provided inputs. Do not invent facts.
- The conversation is provided as a normalized transcript for annotation. Treat it as factual evidence about what happened, then describe the underlying behavior in natural language.
- If evidence supports only a broad issue, name the issue plainly without speculating about hidden details.
- Do not mention transcript formatting, redaction, omitted payloads, message labels, PromptL, system prompts, or other internal implementation details.

Use the simplest wording that still carries the full meaning. Prefer short, everyday words over formal or technical synonyms when both fit, and keep the feedback only as long as it needs to be — no padding, no restatement, no meta-commentary. The original context and nuance must still come through; simpler wording is the goal, not less information.

Respond with structured data containing a single "feedback" field with your annotation text.
`.trim()

const SYSTEM_PROMPT_PREVIEW_MAX_LINES = 4
const SYSTEM_PROMPT_PREVIEW_MAX_CHARS = 600
const TOOL_RESULT_ERROR_TEXT = /(^error\b|error:\s*|\bfailed\b|\bfailure\b|\bexception\b|\btimeout\b|\bunavailable\b)/i
const TOOL_RESULT_ERROR_STATUSES = new Set(["error", "failed", "failure"])

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function toNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null
}

function cropSystemPromptPreview(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")

  if (lines.length === 0) return ""

  const preview = lines.slice(0, SYSTEM_PROMPT_PREVIEW_MAX_LINES).join(" ")
  const truncated =
    preview.length > SYSTEM_PROMPT_PREVIEW_MAX_CHARS
      ? preview.slice(0, SYSTEM_PROMPT_PREVIEW_MAX_CHARS).trimEnd()
      : preview

  return lines.length > SYSTEM_PROMPT_PREVIEW_MAX_LINES || truncated.length < preview.length
    ? `${truncated}...`
    : truncated
}

function responseIndicatesFailure(response: unknown): boolean {
  if (typeof response === "string") {
    const trimmed = response.trim()
    if (trimmed === "") return false

    try {
      return responseIndicatesFailure(JSON.parse(trimmed))
    } catch {
      return TOOL_RESULT_ERROR_TEXT.test(trimmed)
    }
  }

  if (Array.isArray(response)) {
    return response.some(responseIndicatesFailure)
  }

  if (!isRecord(response)) return false

  if (response.isError === true || response.ok === false || response.success === false) {
    return true
  }

  const status = toNonEmptyString(response.status)
  if (status && TOOL_RESULT_ERROR_STATUSES.has(status.toLowerCase())) {
    return true
  }

  if ("error" in response) {
    const error = response.error
    if (error !== null && error !== undefined && error !== false && error !== "") {
      return true
    }
  }

  if (Array.isArray(response.errors) && response.errors.length > 0) {
    return true
  }

  return false
}

const formatConversationForAnnotator = (messages: readonly { role: string; parts: unknown[] }[]): string => {
  const lines: string[] = []

  for (const message of messages) {
    if (message.role === "system") {
      const systemText = message.parts
        .flatMap((part) => {
          if (!isRecord(part) || part.type !== "text") return []
          const content = toNonEmptyString(part.content)
          return content ? [content] : []
        })
        .join("\n")

      const preview = cropSystemPromptPreview(systemText)
      if (preview) lines.push(`[system]: ${preview}`)
      continue
    }

    const textParts: string[] = []

    const flushText = () => {
      if (message.role !== "user" && message.role !== "assistant") return

      const body = textParts.join("\n").trim()
      if (body) lines.push(`[${message.role}]: ${body}`)
      textParts.length = 0
    }

    for (const part of message.parts) {
      if (!isRecord(part)) continue

      if (part.type === "text") {
        const content = toNonEmptyString(part.content)
        if (content && (message.role === "user" || message.role === "assistant")) {
          textParts.push(content)
        }
        continue
      }

      if (part.type === "tool_call" || part.type === "tool-call") {
        flushText()
        lines.push(`[toolcall]: ${toNonEmptyString(part.name) ?? toNonEmptyString(part.toolName) ?? "<unknown tool>"}`)
        continue
      }

      if (part.type === "tool_call_response" || part.type === "tool-result") {
        flushText()
        const response = "response" in part ? part.response : part.result
        lines.push(`[toolresult]: ${responseIndicatesFailure(response) ? "error" : "ok"}`)
      }
    }

    flushText()
  }

  return lines.length > 0 ? lines.join("\n") : "<no conversation messages available>"
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
  const ai = yield* AI

  const systemPrompt = buildAnnotatorSystemPrompt(input.queueSlug)

  const conversationText =
    input.trace.allMessages.length > 0
      ? formatConversationForAnnotator(input.trace.allMessages)
      : "<no conversation messages available>"

  const durationSeconds = input.trace.durationNs / 1_000_000_000

  const prompt = `Provided inputs only — use these facts and the conversation below; do not invent details.

Trace summary (telemetry aggregates; cite only when relevant):
- Approximate duration: ${durationSeconds.toFixed(durationSeconds < 10 ? 2 : 1)}s
- Span count: ${input.trace.spanCount}
- Error count: ${input.trace.errorCount}
- Trace messages (raw): ${input.trace.allMessages.length}

Conversation transcript for annotation:
- This is a compact, normalized rendering of the trace.
- [toolcall] lines name the tool that was invoked.
- [toolresult] lines summarize only whether the tool succeeded or failed.
- Write about the underlying issue in plain language, not about the transcript formatting or what was omitted.
${conversationText}

Return structured data with a single "feedback" field per the system instructions.`

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
  yield* Effect.annotateCurrentSpan("queue.organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("queue.projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("queue.traceId", input.traceId)
  yield* Effect.annotateCurrentSpan("queue.queueSlug", input.queueSlug)

  const trace = yield* loadTraceDetail(input)
  return yield* annotateTraceForQueueUseCase({ ...input, trace })
})
