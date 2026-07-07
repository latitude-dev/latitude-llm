import type { ProjectId } from "@domain/shared"

/**
 * A `building` pointer older than this is treated as a crashed run whose
 * Temporal start failed — the cleanup job reclaims it (resets to idle) so a
 * dead build can't wedge regeneration forever. It is a wide margin over the
 * ~30-minute seed activity timeout so a slow-but-healthy build is never
 * mistaken for a dead one and reclaimed out from under itself.
 */
export const SHOWCASE_BUILD_STALE_AFTER_MS = 2 * 60 * 60 * 1000

/**
 * An orphan project (neither `current` nor `next`) must be at least this old
 * before it is retired. This guards the one race the pointer can't: a project a
 * concurrent regeneration just provisioned but whose `beginNextBuild` the
 * cleanup hasn't yet observed on the pointer — it looks like an orphan for an
 * instant. A freshly-provisioned project is younger than the grace window, so
 * it is never retired; a genuine old `current`/orphan is always older.
 */
export const SHOWCASE_RETIRE_GRACE_MS = 15 * 60 * 1000

/**
 * Daily off-peak cleanup sweep, scheduled an hour before the regeneration cron
 * so a wedged build is reclaimed before the day's regeneration decides whether
 * to resume or provision. Retirement of a just-swapped-out `current` is prompt
 * (enqueued by the regeneration workflow after the swap); this cron is the
 * self-heal / catch-all backstop.
 */
export const SHOWCASE_CLEANUP_CRON_KEY = "showcase:cleanup:daily"
export const SHOWCASE_CLEANUP_CRON_PATTERN = "0 3 * * *"

/**
 * The showcase-org projects to retire: every project that is neither the live
 * `current` nor the in-flight `next`, and older than the grace window. Pure so
 * the selection is unit-testable in isolation from Postgres/ClickHouse. Takes
 * the minimal `{ id, createdAt }` shape to stay free of a `@domain/projects`
 * dependency.
 */
export const selectRetirableShowcaseProjectIds = ({
  projects,
  currentProjectId,
  nextProjectId,
  now,
  retireGraceMs = SHOWCASE_RETIRE_GRACE_MS,
}: {
  readonly projects: readonly { readonly id: ProjectId; readonly createdAt: Date }[]
  readonly currentProjectId: ProjectId | null
  readonly nextProjectId: ProjectId | null
  readonly now: Date
  readonly retireGraceMs?: number
}): ProjectId[] =>
  projects
    .filter((project) => project.id !== currentProjectId && project.id !== nextProjectId)
    .filter((project) => now.getTime() - project.createdAt.getTime() >= retireGraceMs)
    .map((project) => project.id)
