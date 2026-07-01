import type { Incident } from "@domain/incidents"
import { isSignalEscalationEntrySignals } from "@domain/incidents"
import { OrganizationRepository } from "@domain/organizations"
import { ProjectRepository } from "@domain/projects"
import { type AnnotationScore, type Score, ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import {
  type ChSqlClient,
  type OrganizationId,
  type ProjectId,
  SignalId,
  type SqlClient,
  TraceId,
} from "@domain/shared"
import { SignalRepository } from "@domain/signals"
import { Effect } from "effect"
import {
  SAMPLE_CONVERSATIONS_LIMIT,
  SAMPLE_CONVERSATIONS_MAX_CHARS,
  SAMPLE_EXCERPT_MAX_CHARS,
  SAMPLE_TRACE_IDS_LIMIT,
} from "../constants.ts"
import type { AgentDispatchContext, AgentDispatchTrigger } from "../entities/agent-dispatch-context.ts"
import { AgentDispatchTraceReader } from "../ports/repositories.ts"

const TAGS_TOP_N = 5
const TAGS_LOOKBACK_DAYS = 30
const METRICS_WINDOW_HOURS = 24

const mapSignalSource = (source: string): "flagger" | "annotation" | "custom" => {
  if (source === "flagger" || source === "annotation" || source === "custom") return source
  return "custom"
}

const buildDeepLink = (input: {
  readonly webAppUrl: string
  readonly projectSlug: string
  readonly signalSlug?: string
  readonly incidentId?: string
}): string => {
  const base = `${input.webAppUrl}/projects/${input.projectSlug}`
  if (input.signalSlug) return `${base}/signals/${input.signalSlug}`
  if (input.incidentId) return `${base}/incidents/${input.incidentId}`
  return base
}

const snapshotTags = (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly signalId: SignalId
}) =>
  Effect.gen(function* () {
    const analytics = yield* ScoreAnalyticsRepository
    const from = new Date(Date.now() - TAGS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    const aggregates = yield* analytics.aggregateTagsBySignals({
      organizationId: input.organizationId,
      projectId: input.projectId,
      signalIds: [input.signalId],
      timeRange: { from },
    })
    const all = aggregates[0]?.tags ?? []
    if (all.length === 0) return undefined
    return [...all].sort((a, b) => a.localeCompare(b)).slice(0, TAGS_TOP_N)
  })

const snapshotSampleExcerpt = (input: { readonly projectId: ProjectId; readonly signalId: SignalId }) =>
  Effect.gen(function* () {
    const scores = yield* ScoreRepository
    const annotations = yield* scores.listBySignalId({
      projectId: input.projectId,
      signalId: input.signalId,
      source: "annotation",
      options: { limit: 1 },
    })
    const latestAnnotation = annotations.items[0]
    if (latestAnnotation && latestAnnotation.sourceType === "annotation") {
      const raw = latestAnnotation.metadata.rawFeedback
      if (raw.trim().length > 0) return raw.slice(0, SAMPLE_EXCERPT_MAX_CHARS)
    }
    const evaluations = yield* scores.listBySignalId({
      projectId: input.projectId,
      signalId: input.signalId,
      source: "evaluation",
      options: { limit: 1 },
    })
    const latestEvaluation = evaluations.items[0]
    if (
      latestEvaluation &&
      latestEvaluation.sourceType === "evaluation" &&
      latestEvaluation.feedback.trim().length > 0
    ) {
      return latestEvaluation.feedback.slice(0, SAMPLE_EXCERPT_MAX_CHARS)
    }
    return undefined
  })

const snapshotSampleTraceIds = (input: { readonly projectId: ProjectId; readonly signalId: SignalId }) =>
  Effect.gen(function* () {
    const scores = yield* ScoreRepository
    const result = yield* scores.listBySignalId({
      projectId: input.projectId,
      signalId: input.signalId,
      options: { limit: SAMPLE_TRACE_IDS_LIMIT },
    })
    const traceIds = result.items
      .map((item) => item.traceId)
      .filter((id): id is NonNullable<typeof id> => id !== null && id.length > 0)
      .map(String)
    return traceIds.length > 0 ? traceIds : undefined
  })

const truncateText = (text: string, maxChars: number): string =>
  text.length <= maxChars ? text : `${text.slice(0, Math.max(0, maxChars - 15)).trimEnd()}\n…[truncated]`

const formatPart = (part: unknown): string => {
  if (typeof part === "string") return part
  if (part === null || typeof part !== "object") return String(part ?? "")
  const record = part as Record<string, unknown>
  const type = typeof record.type === "string" ? record.type : undefined
  if (typeof record.text === "string") return record.text
  if (typeof record.content === "string") return record.content
  if (typeof record.input === "string") return `[tool input] ${record.input}`
  if (typeof record.output === "string") return `[tool output] ${record.output}`
  const json = JSON.stringify(record)
  return type ? `[${type}] ${json}` : json
}

const messageText = (message: unknown): string => {
  if (message === null || typeof message !== "object") return String(message ?? "")
  const record = message as Record<string, unknown>
  const content = record.content
  const parts = record.parts
  if (Array.isArray(parts)) return parts.map(formatPart).filter(Boolean).join("\n")
  if (Array.isArray(content)) return content.map(formatPart).filter(Boolean).join("\n")
  if (typeof content === "string") return content
  return formatPart(record)
}

const messageRole = (message: unknown): string => {
  if (message !== null && typeof message === "object") {
    const role = (message as Record<string, unknown>).role
    if (typeof role === "string" && role.length > 0) return role
  }
  return "message"
}

const renderMessages = (messages: readonly unknown[], anchorIndex?: number): string =>
  messages
    .map((message, index) => {
      const marker = anchorIndex === index ? " <-- score anchor" : ""
      return `[${index}] ${messageRole(message)}${marker}:\n${messageText(message)}`
    })
    .join("\n\n")

const anchorSelection = (score: AnnotationScore, messages: readonly unknown[]): string | undefined => {
  const { messageIndex, partIndex, startOffset, endOffset } = score.metadata
  if (messageIndex === undefined || partIndex === undefined || startOffset === undefined || endOffset === undefined) {
    return undefined
  }
  const message = messages[messageIndex]
  if (message === undefined || message === null || typeof message !== "object") return undefined
  const record = message as Record<string, unknown>
  const parts = Array.isArray(record.parts) ? record.parts : Array.isArray(record.content) ? record.content : undefined
  const part = parts?.[partIndex]
  const text = formatPart(part)
  if (text.length === 0) return undefined
  return text.slice(startOffset, endOffset)
}

const buildConversationExcerpt = (score: Score, messages: readonly unknown[], perExampleMaxChars: number): string => {
  if (score.sourceType === "annotation" && score.metadata.messageIndex !== undefined) {
    const anchor = score.metadata.messageIndex
    const from = Math.max(0, anchor - 2)
    const to = Math.min(messages.length, anchor + 3)
    const selection = anchorSelection(score, messages)
    const rendered = renderMessages(messages.slice(from, to), anchor - from)
    return truncateText(selection ? `Anchored text: ${selection}\n\n${rendered}` : rendered, perExampleMaxChars)
  }
  return truncateText(renderMessages(messages), perExampleMaxChars)
}

const snapshotSampleConversations = (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly signalId: SignalId
}) =>
  Effect.gen(function* () {
    const scores = yield* ScoreRepository
    const traces = yield* AgentDispatchTraceReader
    const result = yield* scores.listBySignalId({
      projectId: input.projectId,
      signalId: input.signalId,
      options: { limit: SAMPLE_CONVERSATIONS_LIMIT * 3 },
    })
    const scoresWithTrace = result.items.filter(
      (score): score is Score & { readonly traceId: NonNullable<Score["traceId"]> } => score.traceId !== null,
    )
    const selected: Array<Score & { readonly traceId: NonNullable<Score["traceId"]> }> = []
    const seenTraceIds = new Set<string>()
    for (const score of scoresWithTrace) {
      const traceId = String(score.traceId)
      if (seenTraceIds.has(traceId)) continue
      seenTraceIds.add(traceId)
      selected.push(score)
      if (selected.length >= SAMPLE_CONVERSATIONS_LIMIT) break
    }
    if (selected.length === 0) return undefined

    const perExampleMaxChars = Math.floor(SAMPLE_CONVERSATIONS_MAX_CHARS / Math.max(1, selected.length))
    const examples = yield* Effect.forEach(selected, (score) =>
      traces
        .findMessagesByTraceId({
          organizationId: input.organizationId,
          projectId: input.projectId,
          traceId: TraceId(score.traceId),
        })
        .pipe(
          Effect.map((messages) => ({
            traceId: String(score.traceId),
            ...(score.feedback.trim().length > 0 ? { scoreFeedback: truncateText(score.feedback, 500) } : {}),
            excerpt: buildConversationExcerpt(score, messages, perExampleMaxChars),
          })),
          Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
          Effect.catchTag("RepositoryError", () => Effect.succeed(null)),
        ),
    )
    const present = examples.filter((example): example is NonNullable<typeof example> => example !== null)
    return present.length > 0 ? present : undefined
  })

const buildMetricsFromIncident = (incident: Incident) => {
  const entrySignals = incident.entrySignals
  if (!isSignalEscalationEntrySignals(entrySignals)) return undefined
  return {
    occurrences: entrySignals.entryCount24h,
    windowHours: METRICS_WINDOW_HOURS,
    baselinePerHour: entrySignals.expected1h,
  }
}

export const buildDispatchContextFromIncident = (input: {
  readonly incident: Incident
  readonly trigger: AgentDispatchTrigger
  readonly webAppUrl: string
}) =>
  Effect.gen(function* () {
    const orgRepo = yield* OrganizationRepository
    const projectRepo = yield* ProjectRepository
    const signalRepo = yield* SignalRepository

    const [organization, project] = yield* Effect.all([
      orgRepo.findById(input.incident.organizationId),
      projectRepo.findById(input.incident.projectId),
    ])

    const signal =
      input.incident.sourceType === "signal"
        ? yield* signalRepo
            .findById(SignalId(input.incident.sourceId))
            .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
        : null

    const signalId = signal ? SignalId(signal.id) : null
    const [tags, sampleExcerpt, sampleTraceIds, sampleConversations] =
      signalId !== null
        ? yield* Effect.all([
            snapshotTags({
              organizationId: input.incident.organizationId,
              projectId: input.incident.projectId,
              signalId,
            }),
            snapshotSampleExcerpt({ projectId: input.incident.projectId, signalId }),
            snapshotSampleTraceIds({ projectId: input.incident.projectId, signalId }),
            snapshotSampleConversations({
              organizationId: input.incident.organizationId,
              projectId: input.incident.projectId,
              signalId,
            }),
          ])
        : [undefined, undefined, undefined, undefined]

    const context: AgentDispatchContext = {
      trigger: input.trigger,
      organizationName: organization.name,
      projectName: project.name,
      projectSlug: project.slug,
      ...(signal
        ? {
            signal: {
              id: signal.id,
              slug: signal.slug,
              name: signal.name,
              source: mapSignalSource(signal.source),
              priority: signal.priority,
            },
          }
        : {}),
      incident: {
        id: input.incident.id,
        severity: input.incident.severity,
      },
      ...(input.incident.sourceType === "signal" ? { metrics: buildMetricsFromIncident(input.incident) } : {}),
      ...(sampleExcerpt ? { sampleExcerpt } : {}),
      ...(tags ? { tags } : {}),
      deepLinkUrl: buildDeepLink({
        webAppUrl: input.webAppUrl,
        projectSlug: project.slug,
        ...(signal ? { signalSlug: signal.slug } : { incidentId: input.incident.id }),
      }),
      ...(sampleTraceIds ? { sampleTraceIds } : {}),
      ...(sampleConversations ? { sampleConversations } : {}),
    }

    return context
  }) as Effect.Effect<
    AgentDispatchContext,
    unknown,
    | SqlClient
    | ChSqlClient
    | OrganizationRepository
    | ProjectRepository
    | SignalRepository
    | ScoreRepository
    | ScoreAnalyticsRepository
    | AgentDispatchTraceReader
  >

export const buildDispatchContextFromSignal = (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly signalId: SignalId
  readonly webAppUrl: string
}) =>
  Effect.gen(function* () {
    const orgRepo = yield* OrganizationRepository
    const projectRepo = yield* ProjectRepository
    const signalRepo = yield* SignalRepository

    const [organization, project, signal] = yield* Effect.all([
      orgRepo.findById(input.organizationId),
      projectRepo.findById(input.projectId),
      signalRepo.findById(input.signalId),
    ])

    const [tags, sampleExcerpt, sampleTraceIds, sampleConversations] = yield* Effect.all([
      snapshotTags({
        organizationId: input.organizationId,
        projectId: input.projectId,
        signalId: input.signalId,
      }),
      snapshotSampleExcerpt({ projectId: input.projectId, signalId: input.signalId }),
      snapshotSampleTraceIds({ projectId: input.projectId, signalId: input.signalId }),
      snapshotSampleConversations({
        organizationId: input.organizationId,
        projectId: input.projectId,
        signalId: input.signalId,
      }),
    ])

    return {
      trigger: "signal.discovered" as const,
      organizationName: organization.name,
      projectName: project.name,
      projectSlug: project.slug,
      signal: {
        id: signal.id,
        slug: signal.slug,
        name: signal.name,
        source: mapSignalSource(signal.source),
        priority: signal.priority,
      },
      ...(sampleExcerpt ? { sampleExcerpt } : {}),
      ...(tags ? { tags } : {}),
      deepLinkUrl: buildDeepLink({
        webAppUrl: input.webAppUrl,
        projectSlug: project.slug,
        signalSlug: signal.slug,
      }),
      ...(sampleTraceIds ? { sampleTraceIds } : {}),
      ...(sampleConversations ? { sampleConversations } : {}),
    } satisfies AgentDispatchContext
  }) as Effect.Effect<
    AgentDispatchContext,
    unknown,
    | SqlClient
    | ChSqlClient
    | OrganizationRepository
    | ProjectRepository
    | SignalRepository
    | ScoreRepository
    | ScoreAnalyticsRepository
    | AgentDispatchTraceReader
  >

export const resolveIncidentTrigger = (incident: Incident): AgentDispatchTrigger | null => {
  if (incident.sourceType === "signal") return "incident.opened"
  if (incident.sourceType === "monitor") return "monitor.incident"
  return null
}

export const incidentSourceId = (incident: Incident): string => incident.sourceId

export const incidentSourceType = (incident: Incident): "signal" | "monitor" =>
  incident.sourceType === "monitor" ? "monitor" : "signal"
