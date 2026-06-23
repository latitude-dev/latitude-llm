import type { SavedSearchNotFoundError, SavedSearchRepository } from "@domain/saved-searches"
import {
  type AlertIncidentCondition,
  generateSlug,
  type MonitorConfig,
  type MonitorId,
  type MonitorMetric,
  type NotFoundError,
  type RepositoryError,
  SqlClient,
  toSlug,
  ValidationError,
} from "@domain/shared"
import { Effect } from "effect"
import type { Monitor, MonitorRule, MonitorTarget } from "../entities/monitor.ts"
import { SystemMonitorForbiddenError } from "../errors.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"
import { assertMonitorableSavedSearch } from "./assert-monitorable-saved-search.ts"

const NAME_MAX_LENGTH = 128

export interface UpdateMonitorInput {
  readonly id: MonitorId
  readonly name?: string
  readonly description?: string
  readonly target?: MonitorTarget
  readonly rule?: MonitorRule
}

export type UpdateMonitorError =
  | NotFoundError
  | RepositoryError
  | SavedSearchNotFoundError
  | SystemMonitorForbiddenError
  | ValidationError

const conditionFromConfig = (config: MonitorConfig): AlertIncidentCondition | undefined =>
  config.condition as AlertIncidentCondition | undefined

const validateRule = (rule: MonitorRule, targetMetric: MonitorMetric): Effect.Effect<void, ValidationError> => {
  const condition = conditionFromConfig(rule.config)
  if (rule.trigger === "match" && condition !== undefined) {
    return Effect.fail(
      new ValidationError({ field: "rule.condition", message: "Match monitors cannot define a condition" }),
    )
  }
  if (rule.trigger !== "match" && condition?.trigger !== rule.trigger) {
    return Effect.fail(
      new ValidationError({ field: "rule.condition", message: "Condition trigger must match monitor trigger" }),
    )
  }
  if (rule.trigger === "escalating" && targetMetric.kind !== "count") {
    return Effect.fail(
      new ValidationError({ field: "rule.metric", message: "Escalating monitors only support count metrics" }),
    )
  }
  if (
    rule.trigger === "escalating" &&
    rule.config.metric !== undefined &&
    rule.config.metric.kind !== targetMetric.kind
  ) {
    return Effect.fail(
      new ValidationError({ field: "rule.metric", message: "Monitor rule metric must match the target metric" }),
    )
  }
  if (condition?.trigger === "escalating" && condition.metric.kind !== "count") {
    return Effect.fail(
      new ValidationError({
        field: "rule.condition.metric",
        message: "Escalating monitors only support count metrics",
      }),
    )
  }
  if (
    condition?.trigger === "escalating" &&
    condition.threshold !== undefined &&
    condition.threshold.mode !== "expected"
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

export const updateMonitorUseCase = (
  input: UpdateMonitorInput,
): Effect.Effect<Monitor, UpdateMonitorError, SqlClient | MonitorRepository | SavedSearchRepository> =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient
    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const repository = yield* MonitorRepository
        const monitor = yield* repository.findById(input.id)
        const editsMetadata = input.name !== undefined || input.description !== undefined
        const editsTarget = input.target !== undefined
        const editsLockedSystemRule =
          input.rule !== undefined &&
          (input.rule.trigger !== monitor.rule.trigger || input.rule.severity !== monitor.rule.severity)
        if (monitor.system && (editsMetadata || editsTarget || editsLockedSystemRule)) {
          return yield* new SystemMonitorForbiddenError({ monitorId: input.id, operation: "edited" })
        }

        let nextName = monitor.name
        let nextSlug = monitor.slug
        if (input.name !== undefined) {
          const trimmed = input.name.trim()
          if (trimmed.length < 1 || trimmed.length > NAME_MAX_LENGTH) {
            return yield* new ValidationError({
              field: "name",
              message: `Name must be 1–${NAME_MAX_LENGTH} characters`,
            })
          }
          if (trimmed !== monitor.name) {
            if (toSlug(trimmed) !== monitor.slug) {
              nextSlug = yield* generateSlug({
                name: trimmed,
                count: (slug) =>
                  repository.countActiveBySlug({ projectId: monitor.projectId, slug, excludeId: input.id }),
              }).pipe(
                Effect.catchTag("InvalidSlugInputError", (error) =>
                  Effect.fail(new ValidationError({ field: "name", message: error.reason })),
                ),
              )
            }
            nextName = trimmed
          }
        }

        const nextDescription = input.description !== undefined ? input.description.trim() : monitor.description
        const nextTarget = input.target ?? monitor.target
        const nextRule = input.rule ?? monitor.rule
        yield* validateRule(nextRule, nextTarget.metric)
        if (nextTarget.type === "savedSearch" && nextTarget.id !== null) {
          yield* assertMonitorableSavedSearch(nextTarget.id)
        }

        const now = new Date()
        const nextMonitor = {
          ...monitor,
          name: nextName,
          slug: nextSlug,
          description: nextDescription,
          target: nextTarget,
          rule: nextRule,
          updatedAt: now,
        }
        yield* repository.save(nextMonitor)
        return nextMonitor
      }),
    )
  })
