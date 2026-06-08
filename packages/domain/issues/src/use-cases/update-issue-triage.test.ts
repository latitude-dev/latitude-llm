import { MembershipRepository } from "@domain/organizations"
import { createFakeMembershipRepository } from "@domain/organizations/testing"
import { IssueId, OrganizationId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Issue } from "../entities/issue.ts"
import { createIssueCentroid } from "../helpers.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { createFakeIssueRepository } from "../testing/fake-issue-repository.ts"
import { updateIssueTriageUseCase } from "./update-issue-triage.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const otherProjectId = "qqqqqqqqqqqqqqqqqqqqqqqq"
const memberUserId = "uuuuuuuuuuuuuuuuuuuuuuuu"
const strangerUserId = "wwwwwwwwwwwwwwwwwwwwwwww"

const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: IssueId("iiiiiiiiiiiiiiiiiiiiiiii"),
  slug: "test-issue",
  organizationId,
  projectId,
  name: "Triage candidate",
  description: "The assistant fails in a repeatable way.",
  source: "annotation",
  assigneeId: null,
  priority: null,
  centroid: createIssueCentroid(),
  clusteredAt: new Date("2026-03-20T10:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-03-20T10:00:00.000Z"),
  updatedAt: new Date("2026-03-20T10:00:00.000Z"),
  ...overrides,
})

const makeProvider = (input: {
  readonly issueRepository: ReturnType<typeof createFakeIssueRepository>["repository"]
  readonly members?: readonly string[]
}) => {
  const members = new Set(input.members ?? [])
  const { repository: membershipRepository } = createFakeMembershipRepository({
    isMember: (_orgId, userId) => Effect.succeed(members.has(userId)),
  })

  return Layer.mergeAll(
    Layer.succeed(IssueRepository, input.issueRepository),
    Layer.succeed(MembershipRepository, membershipRepository),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(organizationId) })),
  )
}

describe("updateIssueTriageUseCase", () => {
  it("assigns a member and sets priority", async () => {
    const now = new Date("2026-04-10T12:00:00.000Z")
    const issue = makeIssue()
    const { repository: issueRepository, issues } = createFakeIssueRepository([issue])

    const result = await Effect.runPromise(
      updateIssueTriageUseCase({
        projectId,
        issueId: issue.id,
        assigneeId: memberUserId,
        priority: "high",
        now,
      }).pipe(Effect.provide(makeProvider({ issueRepository, members: [memberUserId] }))),
    )

    expect(result.changed).toBe(true)
    expect(result.assigneeId).toBe(memberUserId)
    expect(result.priority).toBe("high")
    expect(issues.get(issue.id)?.assigneeId).toBe(memberUserId)
    expect(issues.get(issue.id)?.priority).toBe("high")
    expect(issues.get(issue.id)?.updatedAt).toEqual(now)
  })

  it("rejects an assignee that is not a member of the organization", async () => {
    const issue = makeIssue()
    const { repository: issueRepository, issues } = createFakeIssueRepository([issue])

    await expect(
      Effect.runPromise(
        updateIssueTriageUseCase({
          projectId,
          issueId: issue.id,
          assigneeId: strangerUserId,
        }).pipe(Effect.provide(makeProvider({ issueRepository, members: [memberUserId] }))),
      ),
    ).rejects.toMatchObject({ _tag: "BadRequestError" })

    expect(issues.get(issue.id)?.assigneeId).toBeNull()
  })

  it("clears the assignee with an explicit null without a membership check", async () => {
    const now = new Date("2026-04-11T12:00:00.000Z")
    const issue = makeIssue({ assigneeId: memberUserId, priority: "urgent" })
    const { repository: issueRepository, issues } = createFakeIssueRepository([issue])

    const result = await Effect.runPromise(
      updateIssueTriageUseCase({
        projectId,
        issueId: issue.id,
        assigneeId: null,
        now,
      }).pipe(Effect.provide(makeProvider({ issueRepository, members: [] }))),
    )

    expect(result.changed).toBe(true)
    expect(result.assigneeId).toBeNull()
    // priority left untouched (key omitted)
    expect(issues.get(issue.id)?.priority).toBe("urgent")
  })

  it("leaves omitted fields untouched and is a no-op when nothing changes", async () => {
    const issue = makeIssue({ assigneeId: memberUserId, priority: "low" })
    const { repository: issueRepository, issues } = createFakeIssueRepository([issue])

    const result = await Effect.runPromise(
      updateIssueTriageUseCase({
        projectId,
        issueId: issue.id,
        priority: "low",
      }).pipe(Effect.provide(makeProvider({ issueRepository, members: [memberUserId] }))),
    )

    expect(result.changed).toBe(false)
    expect(issues.get(issue.id)?.assigneeId).toBe(memberUserId)
    expect(issues.get(issue.id)?.priority).toBe("low")
    expect(issues.get(issue.id)?.updatedAt).toEqual(issue.updatedAt)
  })

  it("rejects an issue that does not belong to the requested project", async () => {
    const issue = makeIssue({ projectId: otherProjectId })
    const { repository: issueRepository } = createFakeIssueRepository([issue])

    await expect(
      Effect.runPromise(
        updateIssueTriageUseCase({
          projectId,
          issueId: issue.id,
          priority: "high",
        }).pipe(Effect.provide(makeProvider({ issueRepository, members: [memberUserId] }))),
      ),
    ).rejects.toMatchObject({ _tag: "BadRequestError" })
  })
})
