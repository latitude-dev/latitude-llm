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
 * Callers must bind `organizationId`, `projectId`, `from`, `to`,
 * `debounceSeconds`, and `noReflagTag`.
 */
// `screenSessionFlaggersUseCase` exits on no-reflag sessions before writing any decision.
export const ELIGIBLE_SESSIONS_SUBQUERY = `
  SELECT
    session_id,
    sum(tokens_total) AS tokens_total,
    groupUniqArrayIfMerge(models) AS models,
    argMaxIfMerge(simulation_id) AS simulation_id,
    groupUniqArrayArray(tags) AS tags,
    if(
      max(max_start_time) >= min(min_start_time),
      max(max_start_time),
      max(max_end_time)
    ) AS last_activity_time
  FROM sessions
  WHERE organization_id = {organizationId:String}
    AND project_id = {projectId:String}
  GROUP BY session_id
  HAVING last_activity_time >= {from:DateTime64(9, 'UTC')}
    AND last_activity_time <= subtractSeconds({to:DateTime64(9, 'UTC')}, {debounceSeconds:UInt32})
    AND (tokens_total > 0 OR length(models) > 0)
    AND simulation_id = ''
    AND NOT has(tags, {noReflagTag:String})
`

export const ELIGIBLE_SESSION_IDS_QUERY = `SELECT session_id FROM (${ELIGIBLE_SESSIONS_SUBQUERY})`

export const ELIGIBLE_SESSION_COUNT_QUERY = `SELECT count() AS eligible_sessions FROM (${ELIGIBLE_SESSIONS_SUBQUERY})`
