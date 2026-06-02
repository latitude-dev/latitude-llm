import { buildSystemMonitors, MonitorRepository } from "@domain/monitors"
import { type OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { AdminOrganizationRepository } from "./organization-repository.ts"

export interface ResetSystemMonitorsInput {
  readonly organizationId: OrganizationId
}

export interface ResetSystemMonitorsResult {
  readonly projectsCount: number
  readonly monitorsReset: number
}

/**
 * Backoffice "reset system monitors": re-provisions the three system monitors
 * to their current `SYSTEM_MONITOR_DEFINITIONS` for every project in the org.
 * Lets staff push definition changes (name/description/alert condition values)
 * onto an org's existing system monitors. Repo-side it upserts metadata and
 * resets alert conditions while preserving `mutedAt` and incident history (the
 * old alerts are soft-deleted, not dropped). Runs in the admin/`"system"`
 * RLS-off context — the repo filters by the target project, not session org.
 */
export const resetSystemMonitorsUseCase = Effect.fn("admin.resetSystemMonitors")(function* (
  input: ResetSystemMonitorsInput,
) {
  yield* Effect.annotateCurrentSpan("admin.targetOrganizationId", input.organizationId)

  const adminRepo = yield* AdminOrganizationRepository
  const monitorRepo = yield* MonitorRepository
  const org = yield* adminRepo.findById(input.organizationId)

  let monitorsReset = 0
  for (const project of org.projects) {
    const monitors = buildSystemMonitors({ organizationId: input.organizationId, projectId: ProjectId(project.id) })
    const reset = yield* monitorRepo.resetSystemMonitors(monitors)
    monitorsReset += reset.length
  }

  return { projectsCount: org.projects.length, monitorsReset } satisfies ResetSystemMonitorsResult
})
