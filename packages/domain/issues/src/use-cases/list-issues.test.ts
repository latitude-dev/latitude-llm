import { type IssueOccurrenceAggregate, ScoreAnalyticsRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository } from "@domain/scores/testing"
import { IssueId, OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { type Issue, IssueState } from "../entities/issue.ts"
import { createIssueCentroid } from "../helpers.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { createFakeIssueRepository } from "../testing/fake-issue-repository.ts"
import { listIssuesUseCase } from "./list-issues.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"

const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: IssueId("iiiiiiiiiiiiiiiiiiiiiiii"),
  uuid: "11111111-1111-4111-8111-111111111111",
  organizationId,
  projectId,
  name: "Reliability issue",
  description: "The assistant misbehaves in a repeatable way.",
  centroid: createIssueCentroid(),
  clusteredAt: new Date("2026-03-01T08:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-03-01T08:00:00.000Z"),
  updatedAt: new Date("2026-03-01T08:00:00.000Z"),
  ...overrides,
})

describe("listIssuesUseCase", () => {
  it("enriches the current page with derived lifecycle states from analytics", async () => {
    const now = new Date("2026-04-10T00:00:00.000Z")
    const newestIssue = makeIssue({
      id: IssueId("aaaaaaaaaaaaaaaaaaaaaaaa"),
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      createdAt: new Date("2026-04-07T08:00:00.000Z"),
      updatedAt: new Date("2026-04-07T08:00:00.000Z"),
      clusteredAt: new Date("2026-04-07T08:00:00.000Z"),
    })
    const regressedIssue = makeIssue({
      id: IssueId("bbbbbbbbbbbbbbbbbbbbbbbb"),
      uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      resolvedAt: new Date("2026-04-01T12:00:00.000Z"),
      createdAt: new Date("2026-03-20T08:00:00.000Z"),
      updatedAt: new Date("2026-03-20T08:00:00.000Z"),
      clusteredAt: new Date("2026-03-20T08:00:00.000Z"),
    })
    const ignoredIssue = makeIssue({
      id: IssueId("cccccccccccccccccccccccc"),
      uuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      ignoredAt: new Date("2026-04-02T12:00:00.000Z"),
      createdAt: new Date("2026-03-10T08:00:00.000Z"),
      updatedAt: new Date("2026-03-10T08:00:00.000Z"),
      clusteredAt: new Date("2026-03-10T08:00:00.000Z"),
    })

    const { repository: issueRepository } = createFakeIssueRepository([ignoredIssue, regressedIssue, newestIssue])
    const occurrencesByIssueId = new Map<string, IssueOccurrenceAggregate>([
      [
        newestIssue.id,
        {
          issueId: newestIssue.id,
          totalOccurrences: 4,
          recentOccurrences: 4,
          baselineAvgOccurrences: 2,
          firstSeenAt: "2026-04-07 08:00:00.000",
          lastSeenAt: "2026-04-09 20:00:00.000",
        },
      ],
      [
        regressedIssue.id,
        {
          issueId: regressedIssue.id,
          totalOccurrences: 6,
          recentOccurrences: 0,
          baselineAvgOccurrences: 0,
          firstSeenAt: "2026-03-20 08:00:00.000",
          lastSeenAt: "2026-04-05 08:00:00.000",
        },
      ],
      [
        ignoredIssue.id,
        {
          issueId: ignoredIssue.id,
          totalOccurrences: 2,
          recentOccurrences: 0,
          baselineAvgOccurrences: 0,
          firstSeenAt: "2026-03-10 08:00:00.000",
          lastSeenAt: "2026-04-02 08:00:00.000",
        },
      ],
    ])
    const aggregateInputs: unknown[] = []
    const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
      aggregateByIssues: (input) => {
        aggregateInputs.push(input)
        return Effect.succeed(
          input.issueIds
            .map((issueId) => occurrencesByIssueId.get(issueId))
            .filter((occurrence): occurrence is IssueOccurrenceAggregate => occurrence !== undefined),
        )
      },
    })

    const result = await Effect.runPromise(
      listIssuesUseCase({
        organizationId,
        projectId,
        limit: 2,
        offset: 0,
        now,
      }).pipe(
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
      ),
    )

    expect(aggregateInputs).toEqual([
      {
        organizationId: OrganizationId(organizationId),
        projectId: ProjectId(projectId),
        issueIds: [newestIssue.id, regressedIssue.id],
      },
    ])
    expect(result.items.map((issue) => ({ id: issue.id, states: issue.states }))).toEqual([
      {
        id: newestIssue.id,
        states: [IssueState.New, IssueState.Escalating],
      },
      {
        id: regressedIssue.id,
        states: [IssueState.Regressed],
      },
    ])
    expect(result.hasMore).toBe(true)
    expect(result.limit).toBe(2)
    expect(result.offset).toBe(0)
  })
})
