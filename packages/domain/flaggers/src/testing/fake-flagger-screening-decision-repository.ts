import { Effect } from "effect"
import type { FlaggerScreeningDecision } from "../entities/flagger-screening-decision.ts"
import type { FlaggerScreeningDecisionRepositoryShape } from "../ports/flagger-screening-decision-repository.ts"

export const createFakeFlaggerScreeningDecisionRepository = (
  seed: readonly FlaggerScreeningDecision[] = [],
  overrides: Partial<FlaggerScreeningDecisionRepositoryShape> = {},
) => {
  const decisions = [...seed]
  const repository: FlaggerScreeningDecisionRepositoryShape = {
    saveMany: (rows) => Effect.sync(() => decisions.push(...rows)).pipe(Effect.asVoid),
    listLatestBySessions: ({ organizationId, projectId, sessionIds, cutoff }) =>
      Effect.sync(() => {
        const wantedSessions = new Set<string>(sessionIds)
        const inScope = decisions.filter(
          (decision) =>
            decision.organizationId === organizationId &&
            decision.projectId === projectId &&
            wantedSessions.has(decision.sessionId) &&
            decision.createdAt <= cutoff,
        )
        const byDecision = new Map<string, FlaggerScreeningDecision>()
        for (const decision of inScope) {
          const current = byDecision.get(decision.decisionId)
          if (!current || compareRevisions(decision, current) > 0) byDecision.set(decision.decisionId, decision)
        }
        const latest = new Map<string, FlaggerScreeningDecision>()
        const generationStartedAt = new Map<string, Date>()
        for (const decision of inScope) {
          const current = generationStartedAt.get(decision.decisionId)
          if (!current || decision.createdAt < current) generationStartedAt.set(decision.decisionId, decision.createdAt)
        }
        for (const decision of byDecision.values()) {
          const key = `${decision.sessionId}\0${decision.flaggerSlug}`
          const current = latest.get(key)
          const decisionStartedAt = generationStartedAt.get(decision.decisionId)
          const currentStartedAt = current ? generationStartedAt.get(current.decisionId) : undefined
          if (!current || (decisionStartedAt && currentStartedAt && decisionStartedAt > currentStartedAt)) {
            latest.set(key, decision)
          }
        }
        return [...latest.values()]
      }),
    ...overrides,
  }
  return { decisions, repository }
}

const compareRevisions = (left: FlaggerScreeningDecision, right: FlaggerScreeningDecision) =>
  left.version - right.version || left.attempt - right.attempt || left.createdAt.getTime() - right.createdAt.getTime()
