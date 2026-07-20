import type { SavedSearchNotFoundError, SavedSearchRepository } from "@domain/saved-searches"
import {
  type AlertSeverity,
  generateId,
  generateSlug,
  type MonitorConfig,
  MonitorId,
  type MonitorTargetType,
  type MonitorTrigger,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  SqlClient,
  ValidationError,
} from "@domain/shared"
import { Effect } from "effect"
import type { Monitor, MonitorTarget } from "../entities/monitor.ts"
import { monitorStreamForTargetType, monitorTargetSchema } from "../entities/monitor.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"
import { assertMonitorableSavedSearch } from "./assert-monitorable-saved-search.ts"

const NAME_MAX_LENGTH = 128

interface CreateMonitorRuleInput {
  readonly trigger: MonitorTrigger
  readonly config: MonitorConfig
  readonly severity: AlertSeverity
}

interface CreateMonitorTargetInput {
  readonly type: MonitorTargetType
  readonly id: string | null
  readonly filterSet?: MonitorTarget["filterSet"]
  readonly query?: string | null | undefined
}

export interface CreateMonitorInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly name: string
  readonly description?: string
  readonly target: CreateMonitorTargetInput
  readonly rule: CreateMonitorRuleInput
}

export type CreateMonitorError = RepositoryError | ValidationError | SavedSearchNotFoundError

const validateRule = (rule: CreateMonitorRuleInput): Effect.Effect<void, ValidationError> => {
  if (rule.trigger === "match" && rule.config.condition !== undefined) {
    return Effect.fail(
      new ValidationError({ field: "rule.condition", message: "Match monitors cannot define a condition" }),
    )
  }
  if (rule.trigger !== "match" && rule.config.condition?.trigger !== rule.trigger) {
    return Effect.fail(
      new ValidationError({ field: "rule.condition", message: "Condition trigger must match monitor trigger" }),
    )
  }
  if (rule.trigger === "escalating" && (rule.config.metric?.kind ?? "count") !== "count") {
    return Effect.fail(
      new ValidationError({ field: "rule.metric", message: "Escalating monitors only support count metrics" }),
    )
  }
  if (rule.config.condition?.trigger === "escalating" && rule.config.condition.metric.kind !== "count") {
    return Effect.fail(
      new ValidationError({
        field: "rule.condition.metric",
        message: "Escalating monitors only support count metrics",
      }),
    )
  }
  if (
    rule.config.condition?.trigger === "escalating" &&
    rule.config.condition.threshold !== undefined &&
    rule.config.condition.threshold.mode !== "expected"
  ) {
    return Effect.fail(
      new ValidationError({
        field: "rule.condition.threshold",
        message: "Escalating monitors only support expected thresholds",
      }),
    )
  }
  return Effect.void
}

export const createMonitorUseCase = (
  input: CreateMonitorInput,
): Effect.Effect<Monitor, CreateMonitorError, SqlClient | MonitorRepository | SavedSearchRepository> =>
  Effect.gen(function* () {
    const trimmedName = input.name.trim()
    if (trimmedName.length < 1 || trimmedName.length > NAME_MAX_LENGTH) {
      return yield* new ValidationError({ field: "name", message: `Name must be 1-${NAME_MAX_LENGTH} characters` })
    }

    yield* validateRule(input.rule)
    if (input.target.type === "savedSearch" && input.target.id !== null) {
      yield* assertMonitorableSavedSearch(input.target.id)
    }

    const targetCandidate = {
      type: input.target.type,
      id: input.target.id,
      ...(input.target.filterSet !== undefined ? { filterSet: input.target.filterSet } : {}),
      kind: input.target.type,
      stream: monitorStreamForTargetType(input.target.type),
      query: input.target.query ?? null,
      savedSearchId: input.target.type === "savedSearch" ? input.target.id : null,
      metric: input.rule.config.metric ?? { kind: "count" },
    }
    const parsedTarget = monitorTargetSchema.safeParse(targetCandidate)
    if (!parsedTarget.success) {
      const issue = parsedTarget.error.issues[0]
      return yield* new ValidationError({
        field: issue?.path.length ? issue.path.map(String).join(".") : "target",
        message: issue?.message ?? "Invalid monitor target",
      })
    }

    const sqlClient = yield* SqlClient
    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const repository = yield* MonitorRepository
        const now = new Date()
        const monitorId = MonitorId(generateId())
        const slug = yield* generateSlug({
          name: trimmedName,
          count: (candidate) =>
            repository.countActiveBySlug({ projectId: input.projectId, slug: candidate, excludeId: monitorId }),
        }).pipe(
          Effect.catchTag("InvalidSlugInputError", (error) =>
            Effect.fail(new ValidationError({ field: "name", message: error.reason })),
          ),
        )

        const monitor: Monitor = {
          id: monitorId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          slug,
          name: trimmedName,
          description: input.description?.trim() ?? "",
          system: false,
          target: {
            type: input.target.type,
            id: input.target.id,
            ...(input.target.filterSet !== undefined ? { filterSet: input.target.filterSet } : {}),
            kind: input.target.type,
            stream: monitorStreamForTargetType(input.target.type),
            query: input.target.query ?? null,
            savedSearchId: input.target.type === "savedSearch" ? input.target.id : null,
            metric: input.rule.config.metric ?? { kind: "count" },
          },
          rule: input.rule,
          mutedAt: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        }
        yield* repository.create(monitor)
        return monitor
      }),
    )
  })
