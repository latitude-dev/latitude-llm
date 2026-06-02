import {
  generateId,
  generateSlug,
  MonitorId,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  SqlClient,
  ValidationError,
} from "@domain/shared"
import { Effect } from "effect"
import type { Monitor } from "../entities/monitor.ts"
import type { AlertConditionMismatchError } from "../errors.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"
import { buildMonitorAlert, type MonitorAlertInput } from "./create-monitor-alert.ts"

const NAME_MAX_LENGTH = 128

export interface CreateMonitorInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly name: string
  readonly description?: string
  /** At least one; each must be a user-creatable kind (see `buildMonitorAlert`). */
  readonly alerts: readonly MonitorAlertInput[]
}

export type CreateMonitorError = RepositoryError | ValidationError | AlertConditionMismatchError

/**
 * Creates a non-system monitor with its alerts, atomically. The monitor's
 * `slug` is derived from `name` (unique per project). Rejects an empty alert
 * list; every alert is validated via `buildMonitorAlert` (user-creatable kinds
 * only). `system` is fixed to `false` — the input has no `system` field, so a
 * system monitor can't be created here.
 */
export const createMonitorUseCase = (
  input: CreateMonitorInput,
): Effect.Effect<Monitor, CreateMonitorError, SqlClient | MonitorRepository> =>
  Effect.gen(function* () {
    const trimmedName = input.name.trim()
    if (trimmedName.length < 1 || trimmedName.length > NAME_MAX_LENGTH) {
      return yield* new ValidationError({ field: "name", message: `Name must be 1–${NAME_MAX_LENGTH} characters` })
    }
    if (input.alerts.length === 0) {
      return yield* new ValidationError({ field: "alerts", message: "A monitor must have at least one alert" })
    }

    const sqlClient = yield* SqlClient
    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const repository = yield* MonitorRepository
        const now = new Date()
        const monitorId = MonitorId(generateId())

        const alerts = yield* Effect.forEach(input.alerts, (alertInput) =>
          buildMonitorAlert(alertInput, monitorId, now),
        )

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
          alerts,
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
