import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { AgentScoreSnapshot } from "../entities/agent-score-snapshot.ts"
import { utcDateOf } from "../entities/agent-score-snapshot.ts"
import { AgentScoreSnapshotRepository } from "../ports/agent-score-snapshot-repository.ts"

/** How far back the history read reaches when the caller names no range. */
export const AGENT_SCORE_HISTORY_DEFAULT_DAYS = 90

export type CurrentAgentScore =
  | { readonly available: true; readonly date: string; readonly snapshot: AgentScoreSnapshot }
  | { readonly available: false; readonly date: string }

/**
 * The project's score for today, or an explicit absence.
 *
 * Never an older snapshot. A score describes the window it was computed over, and yesterday's number
 * presented as today's would be wrong in the one way a reader cannot detect: it would look current.
 * A day with no score is a day the project did not meet its floors, which is information, and the
 * trend keeps the days that did.
 */
export const getCurrentAgentScore = Effect.fn("agentScore.getCurrentAgentScore")(function* (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly now?: Date
}) {
  const date = utcDateOf(input.now ?? new Date())
  const repository = yield* AgentScoreSnapshotRepository
  const snapshot = yield* repository.findByDate({
    organizationId: input.organizationId,
    projectId: input.projectId,
    date,
  })

  return (snapshot ? { available: true, date, snapshot } : { available: false, date }) satisfies CurrentAgentScore
})

const daysBefore = (date: string, days: number): string =>
  new Date(new Date(`${date}T00:00:00.000Z`).getTime() - days * 86_400_000).toISOString().slice(0, 10)

/**
 * The published scores in a date range, oldest first.
 *
 * Dates with no score are simply absent rather than zero-filled: the trend marks them as gaps, and a
 * zero would read as an agent that scored nothing rather than one that could not be measured.
 */
export const listAgentScoreHistory = Effect.fn("agentScore.listAgentScoreHistory")(function* (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly from?: string
  readonly to?: string
  readonly now?: Date
}) {
  const to = input.to ?? utcDateOf(input.now ?? new Date())
  const from = input.from ?? daysBefore(to, AGENT_SCORE_HISTORY_DEFAULT_DAYS)
  const repository = yield* AgentScoreSnapshotRepository

  return yield* repository.listHistory({
    organizationId: input.organizationId,
    projectId: input.projectId,
    from,
    to,
  })
})
