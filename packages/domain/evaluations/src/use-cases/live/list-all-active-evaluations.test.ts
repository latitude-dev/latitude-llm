import { EvaluationId, generateId, OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import {
  defaultEvaluationTrigger,
  type Evaluation,
  emptyEvaluationAlignment,
  evaluationSchema,
} from "../../entities/evaluation.ts"
import { EvaluationRepository, type EvaluationRepositoryShape } from "../../ports/evaluation-repository.ts"
import { listAllActiveEvaluations } from "./list-all-active-evaluations.ts"

const PAGE_SIZE = 100
const PROJECT_ID = ProjectId("p".repeat(24))
const ORG_ID = OrganizationId("o".repeat(24))
const ISSUE_ID = "i".repeat(24)

const makeEvaluation = (id: string): Evaluation =>
  evaluationSchema.parse({
    id: EvaluationId(id),
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    issueId: ISSUE_ID,
    name: "Test evaluation",
    description: "",
    script: "true",
    trigger: defaultEvaluationTrigger(),
    alignment: emptyEvaluationAlignment("hash"),
    alignedAt: new Date("2026-01-01T00:00:00.000Z"),
    archivedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  })

const unusedRepo = (): EvaluationRepositoryShape => ({
  findById: () => Effect.die("unexpected findById"),
  save: () => Effect.die("unexpected save"),
  listByProjectId: () => Effect.die("unexpected listByProjectId"),
  listByIssueId: () => Effect.die("unexpected listByIssueId"),
  listByIssueIds: () => Effect.die("unexpected listByIssueIds"),
  archive: () => Effect.die("unexpected archive"),
  unarchive: () => Effect.die("unexpected unarchive"),
  softDelete: () => Effect.die("unexpected softDelete"),
  softDeleteByIssueId: () => Effect.die("unexpected softDeleteByIssueId"),
})

describe("listAllActiveEvaluations", () => {
  it("returns a single page without further calls when hasMore is false", async () => {
    const ev = makeEvaluation(generateId())
    const calls: Array<{ offset: number | undefined; limit: number | undefined }> = []

    const repo: EvaluationRepositoryShape = {
      ...unusedRepo(),
      listByProjectId: ({ projectId, options }) => {
        calls.push({ offset: options?.offset, limit: options?.limit })
        expect(projectId).toBe(PROJECT_ID)
        expect(options?.lifecycle).toBe("active")
        expect(options?.limit).toBe(PAGE_SIZE)
        return Effect.succeed({
          items: [ev],
          hasMore: false,
          limit: PAGE_SIZE,
          offset: options?.offset ?? 0,
        })
      },
    }

    const result = await Effect.runPromise(
      listAllActiveEvaluations({ projectId: PROJECT_ID }).pipe(Effect.provideService(EvaluationRepository, repo)),
    )

    expect(calls).toEqual([{ offset: 0, limit: PAGE_SIZE }])
    expect(result).toEqual([ev])
  })

  it("paginates with increasing offsets until hasMore is false and concatenates all items", async () => {
    const page1 = Array.from({ length: PAGE_SIZE }, () => makeEvaluation(generateId()))
    const page2 = Array.from({ length: PAGE_SIZE }, () => makeEvaluation(generateId()))
    const page3 = [makeEvaluation(generateId()), makeEvaluation(generateId())]

    const calls: Array<{ offset: number | undefined; limit: number | undefined }> = []
    let invocation = 0

    const repo: EvaluationRepositoryShape = {
      ...unusedRepo(),
      listByProjectId: ({ projectId, options }) => {
        calls.push({ offset: options?.offset, limit: options?.limit })
        expect(projectId).toBe(PROJECT_ID)
        expect(options?.lifecycle).toBe("active")
        expect(options?.limit).toBe(PAGE_SIZE)

        invocation += 1
        if (invocation === 1) {
          expect(options?.offset).toBe(0)
          return Effect.succeed({
            items: page1,
            hasMore: true,
            limit: PAGE_SIZE,
            offset: 0,
          })
        }
        if (invocation === 2) {
          expect(options?.offset).toBe(PAGE_SIZE)
          return Effect.succeed({
            items: page2,
            hasMore: true,
            limit: PAGE_SIZE,
            offset: PAGE_SIZE,
          })
        }
        expect(options?.offset).toBe(PAGE_SIZE * 2)
        return Effect.succeed({
          items: page3,
          hasMore: false,
          limit: PAGE_SIZE,
          offset: PAGE_SIZE * 2,
        })
      },
    }

    const result = await Effect.runPromise(
      listAllActiveEvaluations({ projectId: PROJECT_ID }).pipe(Effect.provideService(EvaluationRepository, repo)),
    )

    expect(calls).toEqual([
      { offset: 0, limit: PAGE_SIZE },
      { offset: PAGE_SIZE, limit: PAGE_SIZE },
      { offset: PAGE_SIZE * 2, limit: PAGE_SIZE },
    ])
    expect(result).toHaveLength(PAGE_SIZE * 2 + page3.length)
    expect(result.slice(0, PAGE_SIZE)).toEqual(page1)
    expect(result.slice(PAGE_SIZE, PAGE_SIZE * 2)).toEqual(page2)
    expect(result.slice(PAGE_SIZE * 2)).toEqual(page3)
  })
})
