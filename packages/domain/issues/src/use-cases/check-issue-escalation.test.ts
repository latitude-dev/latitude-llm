import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { ScoreAnalyticsRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository } from "@domain/scores/testing"
import { ChSqlClient, IssueId, OrganizationId, SqlClient, type SqlClientShape } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { ESCALATION_MIN_OCCURRENCES_THRESHOLD } from "../constants.ts"
import type { Issue } from "../entities/issue.ts"
import { createIssueCentroid, getEscalationExitThreshold, getEscalationOccurrenceThreshold } from "../helpers.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { createFakeIssueRepository } from "../testing/fake-issue-repository.ts"
import { checkIssueEscalationUseCase } from "./check-issue-escalation.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const issueId = "iiiiiiiiiiiiiiiiiiiiiiii"

const makeIssue = (overrides?: Partial<Issue>): Issue => ({
  id: IssueId(issueId),
  uuid: "11111111-1111-4111-8111-111111111111",
  slug: "test-issue",
  organizationId,
  projectId,
  name: "Token leakage in responses",
  description: "The assistant leaks API tokens in its response.",
  source: "annotation",
  centroid: createIssueCentroid(),
  clusteredAt: new Date("2026-04-29T10:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-04-29T10:00:00.000Z"),
  updatedAt: new Date("2026-04-29T10:00:00.000Z"),
  ...overrides,
})

const createPassthroughSqlClient = (id: string): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(id),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }
  return sqlClient
}

const provideTestLayers = (params: {
  readonly issue: Issue
  readonly isEscalating?: boolean
  readonly recentOccurrences: number
  readonly baselineAvgOccurrences?: number
  readonly events: OutboxWriteEvent[]
  readonly firstSeenAt?: Date
}) => {
  const { repository: issueRepository } = createFakeIssueRepository([params.issue], undefined, {
    lifecycle: new Map([[params.issue.id, { isEscalating: params.isEscalating ?? false, isRegressed: false }]]),
  })
  const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
    aggregateByIssues: () =>
      Effect.succeed([
        {
          issueId: IssueId(issueId),
          totalOccurrences: params.recentOccurrences,
          recentOccurrences: params.recentOccurrences,
          baselineAvgOccurrences: params.baselineAvgOccurrences ?? 0,
          firstSeenAt: params.firstSeenAt ?? new Date("2026-04-01T10:00:00.000Z"),
          lastSeenAt: new Date("2026-05-07T10:00:00.000Z"),
        },
      ]),
  })

  return {
    apply: <A, E>(
      effect: Effect.Effect<
        A,
        E,
        ScoreAnalyticsRepository | IssueRepository | OutboxEventWriter | SqlClient | ChSqlClient
      >,
    ) =>
      effect.pipe(
        Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(OutboxEventWriter, {
          write: (event) =>
            Effect.sync(() => {
              params.events.push(event)
            }),
        }),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
        Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(organizationId) })),
      ),
  }
}

describe("checkIssueEscalationUseCase", () => {
  it("emits IssueEscalated when an older issue crosses the entryThreshold", async () => {
    const issue = makeIssue({ createdAt: new Date("2026-04-01T10:00:00.000Z") })
    const events: OutboxWriteEvent[] = []
    const { apply } = provideTestLayers({
      issue,
      isEscalating: false,
      recentOccurrences: getEscalationOccurrenceThreshold(0),
      events,
      firstSeenAt: new Date("2026-04-01T10:00:00.000Z"),
    })

    const result = await Effect.runPromise(apply(checkIssueEscalationUseCase({ organizationId, projectId, issueId })))

    expect(result.transition).toBe("entered")
    expect(result.currentlyEscalating).toBe(true)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventName: "IssueEscalated",
      aggregateType: "issue",
      aggregateId: issueId,
      payload: { organizationId, projectId, issueId },
    })
  })

  // TODO(sans): fix this test
  it.skip("does not emit IssueEscalated while the issue is still new", async () => {
    // firstSeenAt within NEW_ISSUE_AGE_DAYS of now → isNew guard blocks entry.
    const issue = makeIssue({ createdAt: new Date("2026-05-05T10:00:00.000Z") })
    const events: OutboxWriteEvent[] = []
    const { apply } = provideTestLayers({
      issue,
      isEscalating: false,
      recentOccurrences: getEscalationOccurrenceThreshold(0) + 50,
      events,
      firstSeenAt: new Date("2026-05-05T10:00:00.000Z"),
    })

    const result = await Effect.runPromise(apply(checkIssueEscalationUseCase({ organizationId, projectId, issueId })))

    expect(result.transition).toBe("none")
    expect(result.currentlyEscalating).toBe(false)
    expect(events).toHaveLength(0)
  })

  it("does not transition when not escalating and recent is below entryThreshold", async () => {
    const events: OutboxWriteEvent[] = []
    const { apply } = provideTestLayers({
      issue: makeIssue(),
      isEscalating: false,
      recentOccurrences: ESCALATION_MIN_OCCURRENCES_THRESHOLD - 1,
      events,
    })

    const result = await Effect.runPromise(apply(checkIssueEscalationUseCase({ organizationId, projectId, issueId })))

    expect(result.transition).toBe("none")
    expect(result.currentlyEscalating).toBe(false)
    expect(events).toHaveLength(0)
  })

  it("emits IssueEscalationEnded when recent drops below exitThreshold", async () => {
    const events: OutboxWriteEvent[] = []
    const { apply } = provideTestLayers({
      issue: makeIssue(),
      isEscalating: true,
      recentOccurrences: getEscalationExitThreshold(0) - 1,
      events,
    })

    const result = await Effect.runPromise(apply(checkIssueEscalationUseCase({ organizationId, projectId, issueId })))

    expect(result.transition).toBe("exited")
    expect(result.currentlyEscalating).toBe(false)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventName: "IssueEscalationEnded",
      aggregateType: "issue",
      aggregateId: issueId,
      payload: { organizationId, projectId, issueId },
    })
  })

  it("holds the escalating state inside the hysteresis band (between exit and entry)", async () => {
    const events: OutboxWriteEvent[] = []
    // baseline > 0 so exit < entry strictly (with baseline=0 they're 14 vs 20).
    const baseline = 5
    const entry = getEscalationOccurrenceThreshold(baseline)
    const exit = getEscalationExitThreshold(baseline)
    const between = Math.floor((entry + exit) / 2)
    expect(between).toBeGreaterThanOrEqual(exit)
    expect(between).toBeLessThan(entry)

    const { apply } = provideTestLayers({
      issue: makeIssue(),
      isEscalating: true,
      recentOccurrences: between,
      baselineAvgOccurrences: baseline,
      events,
    })

    const result = await Effect.runPromise(apply(checkIssueEscalationUseCase({ organizationId, projectId, issueId })))

    expect(result.transition).toBe("none")
    expect(result.currentlyEscalating).toBe(true)
    expect(events).toHaveLength(0)
  })

  it("does not re-emit IssueEscalated when already escalating and still above entry", async () => {
    const events: OutboxWriteEvent[] = []
    const { apply } = provideTestLayers({
      issue: makeIssue(),
      isEscalating: true,
      recentOccurrences: getEscalationOccurrenceThreshold(0) + 5,
      events,
    })

    const result = await Effect.runPromise(apply(checkIssueEscalationUseCase({ organizationId, projectId, issueId })))

    expect(result.transition).toBe("none")
    expect(result.currentlyEscalating).toBe(true)
    expect(events).toHaveLength(0)
  })
})
