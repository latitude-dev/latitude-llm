import { FLAGGER_NO_REFLAG_TAG } from "@domain/flaggers"
import type { OrganizationId, ProjectId } from "@domain/shared"
import { formatCHDate } from "@repo/utils"

/**
 * The score's base population: production sessions whose last activity has
 * settled and which screening could actually have examined.
 *
 * Shared verbatim by the flagger coverage panel and by every window reader, so
 * a project's coverage share is measured against the same sessions the panel
 * counts. Changing the debounce, the traffic predicate, or the exclusions here
 * changes all of them together, which is the point.
 */
export const SESSION_END_DEBOUNCE_SECONDS = 5 * 60

/**
 * Callers must bind `organizationId`, `projectId`, `from`, `to`, `partitionFrom`,
 * `debounceSeconds`, and `noReflagTag` — build them with `eligibleSessionScopeParams`.
 */
// `screenSessionFlaggersUseCase` exits on no-reflag sessions before writing any decision.
const ELIGIBLE_SESSION_LAST_ACTIVITY = `if(
      max(max_start_time) >= min(min_start_time),
      max(max_start_time),
      max(max_end_time)
    )`

const ELIGIBLE_SESSION_AGGREGATES = `
    sum(tokens_total) AS tokens_total,
    groupUniqArrayIfMerge(models) AS models,
    argMaxIfMerge(simulation_id) AS simulation_id,
    groupUniqArrayArray(tags) AS tags,
    ${ELIGIBLE_SESSION_LAST_ACTIVITY} AS last_activity_time`

/**
 * The predicate that decides eligibility, shared by every reader so none can drift from the others.
 */
const ELIGIBLE_SESSION_HAVING = `
  HAVING last_activity_time >= {from:DateTime64(9, 'UTC')}
    AND last_activity_time <= subtractSeconds({to:DateTime64(9, 'UTC')}, {debounceSeconds:UInt32})
    AND (tokens_total > 0 OR length(models) > 0)
    AND simulation_id = ''
    AND NOT has(tags, {noReflagTag:String})`

/** Restores complete aggregates for recent candidate ids before applying eligibility. */
export const ELIGIBLE_SESSIONS_SUBQUERY = `
  WITH candidate_sessions AS (
    SELECT session_id
    FROM sessions
    WHERE organization_id = {organizationId:String}
      AND project_id = {projectId:String}
      AND min_start_time >= {partitionFrom:DateTime64(9, 'UTC')}
    GROUP BY session_id
    HAVING ${ELIGIBLE_SESSION_LAST_ACTIVITY} >= {from:DateTime64(9, 'UTC')}
      AND ${ELIGIBLE_SESSION_LAST_ACTIVITY} <= subtractSeconds(
        {to:DateTime64(9, 'UTC')},
        {debounceSeconds:UInt32}
      )
  )
  SELECT
    session_id,${ELIGIBLE_SESSION_AGGREGATES}
  FROM sessions
  WHERE organization_id = {organizationId:String}
    AND project_id = {projectId:String}
    AND session_id IN (SELECT session_id FROM candidate_sessions)
  GROUP BY session_id
  ${ELIGIBLE_SESSION_HAVING}
`

export const ELIGIBLE_SESSION_IDS_QUERY = `SELECT session_id FROM (${ELIGIBLE_SESSIONS_SUBQUERY})`

export const ELIGIBLE_SESSION_COUNT_QUERY = `SELECT count() AS eligible_sessions FROM (${ELIGIBLE_SESSIONS_SUBQUERY})`

/**
 * How long ago each eligible session last did anything, in whole days before the cutoff.
 *
 * One read answers every candidate step: the subquery spans the longest one and the bucket says
 * which shorter steps also contain the session. Counting the steps separately would scan the same
 * partitions once per step to answer one question. Sessions are counted by whole elapsed days, so a
 * session exactly on a step boundary can land either side of it; one session at one instant does not
 * change which step a thousand-session window selects.
 *
 * The cutoff is cast rather than used directly: `dateDiff` refuses anything that is not a timestamp,
 * and a bound parameter does not always arrive as one.
 */
export const ELIGIBLE_SESSION_AGE_HISTOGRAM_QUERY = `
  SELECT
    intDiv(dateDiff('second', last_activity_time, toDateTime64({to:DateTime64(9, 'UTC')}, 9, 'UTC')), 86400) AS age_days,
    count() AS eligible_sessions
  FROM (${ELIGIBLE_SESSIONS_SUBQUERY})
  GROUP BY age_days
`

/**
 * How far before the cutoff every partition filter reaches back.
 *
 * `sessions` is partitioned by month on `min_start_time`, so a bound on that column is what prunes
 * partitions, and a session that started before the bound is invisible however recently it was
 * active. Measured from the cutoff rather than from each reader's own window start, because those
 * windows differ — the sweep looks over the longest step, the score over the selected one — and a
 * floor that moved with them would let the sweep count a long-running session the score then drops.
 * Three months is far past any session that is still one session; one idle that long is not
 * eligible anyway.
 */
const ELIGIBLE_SESSION_PARTITION_LOOKBACK_DAYS = 90

export const eligibleSessionPartitionFrom = (to: Date): Date =>
  new Date(to.getTime() - ELIGIBLE_SESSION_PARTITION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)

/**
 * The bindings every eligible-session query needs, derived from one window.
 *
 * A single place to derive them because the partition floor is what a reader could most easily get
 * wrong: one that bound a later floor than another would silently measure a different population,
 * which is the one thing this subquery exists to prevent.
 */
export const eligibleSessionScopeParams = ({
  organizationId,
  projectId,
  from,
  to,
}: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly from: Date
  readonly to: Date
}) => ({
  organizationId: organizationId as string,
  projectId: projectId as string,
  from: formatCHDate(from),
  partitionFrom: formatCHDate(eligibleSessionPartitionFrom(to)),
  to: formatCHDate(to),
  debounceSeconds: SESSION_END_DEBOUNCE_SECONDS,
  noReflagTag: FLAGGER_NO_REFLAG_TAG,
})

/**
 * Projects with enough eligible traffic for the daily sweep to fan out to.
 *
 * ⚠️ SECURITY: cross-organisation by design. It carries no organisation filter because the sweep
 * has to find every project in the cluster, so it may only run under the system sentinel. It shares
 * `ELIGIBLE_SESSION_HAVING` with the per-project readers, which is what keeps the sweep's idea of an
 * eligible session identical to the one the score is then computed over.
 *
 * The `min_start_time` bound is the only thing standing between this and a full-history scan of
 * every tenant: the sort key starts at `organization_id`, which a cross-organisation query cannot
 * use, so partition pruning is all that is left. It is deliberately applied before aggregation even
 * though that can drop an older part of a session whose parts straddle a month boundary. The result
 * is a candidate list, not a verdict: the per-project pass recomputes eligibility over the same
 * partition floor, so a dropped part can only make this over-include, and an over-included project
 * simply withholds.
 */
export const ELIGIBLE_PROJECTS_QUERY = `
  SELECT organization_id, project_id, count() AS eligible_sessions
  FROM (
    SELECT
      organization_id,
      project_id,
      session_id,${ELIGIBLE_SESSION_AGGREGATES}
    FROM sessions
    WHERE min_start_time >= {partitionFrom:DateTime64(9, 'UTC')}
    GROUP BY organization_id, project_id, session_id
    ${ELIGIBLE_SESSION_HAVING}
  )
  GROUP BY organization_id, project_id
  HAVING eligible_sessions >= {sessionFloor:UInt32}
  ORDER BY organization_id, project_id
`
