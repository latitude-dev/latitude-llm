import {
  defaultEvaluationTrigger,
  type Evaluation,
  EvaluationRepository,
  emptyEvaluationAlignment,
} from "@domain/evaluations"
import { EvaluationId, IssueId, OrganizationId, SettingsReader, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Issue } from "../entities/issue.ts"
import { createIssueCentroid } from "../helpers.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { createFakeIssueRepository } from "../testing/fake-issue-repository.ts"
import { applyIssueLifecycleCommandUseCase } from "./apply-issue-lifecycle-command.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const otherProjectId = "qqqqqqqqqqqqqqqqqqqqqqqq"

const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: IssueId("iiiiiiiiiiiiiiiiiiiiiiii"),
  uuid: "11111111-1111-4111-8111-111111111111",
  organizationId,
  projectId,
  name: "Issue lifecycle candidate",
  description: "The assistant fails in a repeatable way.",
  source: "annotation",
  centroid: createIssueCentroid(),
  clusteredAt: new Date("2026-03-20T10:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-03-20T10:00:00.000Z"),
  updatedAt: new Date("2026-03-20T10:00:00.000Z"),
  ...overrides,
})

const makeEvaluation = (overrides: Partial<Evaluation> = {}): Evaluation => ({
  id: EvaluationId("eeeeeeeeeeeeeeeeeeeeeeee"),
  organizationId,
  projectId,
  issueId: IssueId("iiiiiiiiiiiiiiiiiiiiiiii"),
  name: "Monitor the issue",
  description: "Generated evaluation",
  script: "return { passed: false }",
  trigger: defaultEvaluationTrigger(),
  alignment: emptyEvaluationAlignment("hash-v1"),
  alignedAt: new Date("2026-03-20T10:00:00.000Z"),
  archivedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-03-20T10:00:00.000Z"),
  updatedAt: new Date("2026-03-20T10:00:00.000Z"),
  ...overrides,
})

const createFakeEvaluationRepository = (seed: readonly Evaluation[] = []) => {
  const evaluations = new Map(seed.map((evaluation) => [evaluation.id, evaluation] as const))
  const softDeleteByIssueIdCalls: Array<{ projectId: string; issueId: string }> = []

  return {
    evaluations,
    softDeleteByIssueIdCalls,
    repository: {
      findById: (id: string) =>
        Effect.sync(() => {
          const evaluation = evaluations.get(EvaluationId(id))

          if (!evaluation) {
            throw new Error(`Missing evaluation ${id}`)
          }

          return evaluation
        }),
      save: (evaluation: Evaluation) =>
        Effect.sync(() => {
          evaluations.set(evaluation.id, evaluation)
        }),
      listByProjectId: ({ projectId }: { readonly projectId: string }) =>
        Effect.sync(() => ({
          items: [...evaluations.values()].filter((evaluation) => evaluation.projectId === projectId),
          hasMore: false,
          limit: evaluations.size,
          offset: 0,
        })),
      listByIssueId: ({ projectId, issueId }: { readonly projectId: string; readonly issueId: string }) =>
        Effect.sync(() => ({
          items: [...evaluations.values()].filter(
            (evaluation) => evaluation.projectId === projectId && evaluation.issueId === issueId,
          ),
          hasMore: false,
          limit: evaluations.size,
          offset: 0,
        })),
      listByIssueIds: ({ projectId, issueIds }: { readonly projectId: string; readonly issueIds: readonly string[] }) =>
        Effect.sync(() => ({
          items: [...evaluations.values()].filter(
            (evaluation) => evaluation.projectId === projectId && issueIds.includes(evaluation.issueId),
          ),
          hasMore: false,
          limit: evaluations.size,
          offset: 0,
        })),
      archive: (id: string) =>
        Effect.sync(() => {
          const evaluation = evaluations.get(EvaluationId(id))
          if (!evaluation) {
            return
          }

          evaluations.set(EvaluationId(id), {
            ...evaluation,
            archivedAt: new Date("2026-04-20T00:00:00.000Z"),
            updatedAt: new Date("2026-04-20T00:00:00.000Z"),
          })
        }),
      unarchive: (_id: string) => Effect.void,
      softDelete: (_id: string) => Effect.void,
      softDeleteByIssueId: ({ projectId, issueId }: { readonly projectId: string; readonly issueId: string }) =>
        Effect.sync(() => {
          softDeleteByIssueIdCalls.push({ projectId, issueId })

          for (const evaluation of evaluations.values()) {
            if (evaluation.projectId === projectId && evaluation.issueId === issueId && evaluation.deletedAt === null) {
              evaluations.set(EvaluationId(evaluation.id), {
                ...evaluation,
                deletedAt: new Date("2026-04-20T00:00:00.000Z"),
                updatedAt: new Date("2026-04-20T00:00:00.000Z"),
              })
            }
          }
        }),
    },
  }
}

const makeSettingsReader = (input: {
  readonly organizationKeepMonitoring?: boolean
  readonly projectKeepMonitoring?: boolean
}) =>
  Layer.succeed(SettingsReader, {
    getOrganizationSettings: () =>
      Effect.succeed(
        input.organizationKeepMonitoring === undefined ? null : { keepMonitoring: input.organizationKeepMonitoring },
      ),
    getProjectSettings: () =>
      Effect.succeed(
        input.projectKeepMonitoring === undefined ? null : { keepMonitoring: input.projectKeepMonitoring },
      ),
  })

const makeProvider = (input: {
  readonly issueRepository: ReturnType<typeof createFakeIssueRepository>["repository"]
  readonly evaluationRepository: ReturnType<typeof createFakeEvaluationRepository>["repository"]
  readonly organizationKeepMonitoring?: boolean
  readonly projectKeepMonitoring?: boolean
}) => {
  const settingsReaderInput: {
    organizationKeepMonitoring?: boolean
    projectKeepMonitoring?: boolean
  } = {}

  if (input.organizationKeepMonitoring !== undefined) {
    settingsReaderInput.organizationKeepMonitoring = input.organizationKeepMonitoring
  }

  if (input.projectKeepMonitoring !== undefined) {
    settingsReaderInput.projectKeepMonitoring = input.projectKeepMonitoring
  }

  return Layer.mergeAll(
    Layer.succeed(IssueRepository, input.issueRepository),
    Layer.succeed(EvaluationRepository, input.evaluationRepository),
    makeSettingsReader(settingsReaderInput),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(organizationId) })),
  )
}

describe("applyIssueLifecycleCommandUseCase", () => {
  it("resolves issues using the project-over-organization keepMonitoring default", async () => {
    const now = new Date("2026-04-10T12:00:00.000Z")
    const issue = makeIssue()
    const evaluation = makeEvaluation()
    const { repository: issueRepository, issues } = createFakeIssueRepository([issue])
    const {
      repository: evaluationRepository,
      evaluations,
      softDeleteByIssueIdCalls,
    } = createFakeEvaluationRepository([evaluation])

    const result = await Effect.runPromise(
      applyIssueLifecycleCommandUseCase({
        projectId,
        issueIds: [issue.id],
        command: "resolve",
        now,
      }).pipe(
        Effect.provide(
          makeProvider({
            issueRepository,
            evaluationRepository,
            organizationKeepMonitoring: false,
            projectKeepMonitoring: true,
          }),
        ),
      ),
    )

    expect(result.keepMonitoring).toBe(true)
    expect(result.items).toEqual([
      {
        issueId: issue.id,
        resolvedAt: now,
        ignoredAt: null,
        updatedAt: now,
        changed: true,
      },
    ])
    expect(issues.get(issue.id)?.resolvedAt).toEqual(now)
    expect(softDeleteByIssueIdCalls).toEqual([])
    expect(evaluations.get(evaluation.id)?.deletedAt).toBeNull()
  })

  it("soft deletes linked evaluations when resolving with keepMonitoring=false", async () => {
    const now = new Date("2026-04-11T09:00:00.000Z")
    const firstIssue = makeIssue({
      id: IssueId("aaaaaaaaaaaaaaaaaaaaaaaa"),
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    })
    const secondIssue = makeIssue({
      id: IssueId("bbbbbbbbbbbbbbbbbbbbbbbb"),
      uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    })
    const firstEvaluation = makeEvaluation({
      id: EvaluationId("cccccccccccccccccccccccc"),
      issueId: firstIssue.id,
    })
    const secondEvaluation = makeEvaluation({
      id: EvaluationId("dddddddddddddddddddddddd"),
      issueId: secondIssue.id,
    })
    const { repository: issueRepository, issues } = createFakeIssueRepository([firstIssue, secondIssue])
    const {
      repository: evaluationRepository,
      evaluations,
      softDeleteByIssueIdCalls,
    } = createFakeEvaluationRepository([firstEvaluation, secondEvaluation])

    const result = await Effect.runPromise(
      applyIssueLifecycleCommandUseCase({
        projectId,
        issueIds: [firstIssue.id, secondIssue.id, firstIssue.id],
        command: "resolve",
        keepMonitoring: false,
        now,
      }).pipe(Effect.provide(makeProvider({ issueRepository, evaluationRepository }))),
    )

    expect(result.keepMonitoring).toBe(false)
    expect(result.items).toHaveLength(2)
    expect(softDeleteByIssueIdCalls).toEqual([
      { projectId, issueId: firstIssue.id },
      { projectId, issueId: secondIssue.id },
    ])
    expect(issues.get(firstIssue.id)?.resolvedAt).toEqual(now)
    expect(issues.get(secondIssue.id)?.resolvedAt).toEqual(now)
    expect(evaluations.get(firstEvaluation.id)?.deletedAt).not.toBeNull()
    expect(evaluations.get(secondEvaluation.id)?.deletedAt).not.toBeNull()
  })

  it("soft deletes linked evaluations immediately when ignoring an issue", async () => {
    const now = new Date("2026-04-12T09:00:00.000Z")
    const issue = makeIssue()
    const evaluation = makeEvaluation()
    const { repository: issueRepository, issues } = createFakeIssueRepository([issue])
    const {
      repository: evaluationRepository,
      evaluations,
      softDeleteByIssueIdCalls,
    } = createFakeEvaluationRepository([evaluation])

    const result = await Effect.runPromise(
      applyIssueLifecycleCommandUseCase({
        projectId,
        issueIds: [issue.id],
        command: "ignore",
        now,
      }).pipe(
        Effect.provide(
          makeProvider({
            issueRepository,
            evaluationRepository,
            organizationKeepMonitoring: true,
          }),
        ),
      ),
    )

    expect(result.keepMonitoring).toBeNull()
    expect(issues.get(issue.id)?.ignoredAt).toEqual(now)
    expect(softDeleteByIssueIdCalls).toEqual([{ projectId, issueId: issue.id }])
    expect(evaluations.get(evaluation.id)?.deletedAt).not.toBeNull()
  })

  it("clears resolved and ignored flags without reactivating evaluations", async () => {
    const now = new Date("2026-04-13T09:00:00.000Z")
    const issue = makeIssue({
      resolvedAt: new Date("2026-04-01T00:00:00.000Z"),
      ignoredAt: new Date("2026-04-02T00:00:00.000Z"),
    })
    const archivedEvaluation = makeEvaluation({
      archivedAt: new Date("2026-04-02T00:00:00.000Z"),
    })
    const { repository: issueRepository, issues } = createFakeIssueRepository([issue])
    const {
      repository: evaluationRepository,
      evaluations,
      softDeleteByIssueIdCalls,
    } = createFakeEvaluationRepository([archivedEvaluation])

    await Effect.runPromise(
      applyIssueLifecycleCommandUseCase({
        projectId,
        issueIds: [issue.id],
        command: "unresolve",
        now,
      }).pipe(Effect.provide(makeProvider({ issueRepository, evaluationRepository }))),
    )
    await Effect.runPromise(
      applyIssueLifecycleCommandUseCase({
        projectId,
        issueIds: [issue.id],
        command: "unignore",
        now,
      }).pipe(Effect.provide(makeProvider({ issueRepository, evaluationRepository }))),
    )

    expect(issues.get(issue.id)?.resolvedAt).toBeNull()
    expect(issues.get(issue.id)?.ignoredAt).toBeNull()
    expect(issues.get(issue.id)?.updatedAt).toEqual(now)
    expect(softDeleteByIssueIdCalls).toEqual([])
    expect(evaluations.get(archivedEvaluation.id)?.archivedAt).toEqual(new Date("2026-04-02T00:00:00.000Z"))
  })

  it("is idempotent when a lifecycle flag is already set", async () => {
    const issue = makeIssue({
      resolvedAt: new Date("2026-04-01T00:00:00.000Z"),
    })
    const evaluation = makeEvaluation()
    const { repository: issueRepository, issues } = createFakeIssueRepository([issue])
    const { repository: evaluationRepository, softDeleteByIssueIdCalls } = createFakeEvaluationRepository([evaluation])

    const result = await Effect.runPromise(
      applyIssueLifecycleCommandUseCase({
        projectId,
        issueIds: [issue.id],
        command: "resolve",
        keepMonitoring: false,
      }).pipe(Effect.provide(makeProvider({ issueRepository, evaluationRepository }))),
    )

    expect(result.items[0]?.changed).toBe(false)
    expect(issues.get(issue.id)?.resolvedAt).toEqual(new Date("2026-04-01T00:00:00.000Z"))
    expect(softDeleteByIssueIdCalls).toEqual([])
  })

  it("rejects issues that do not belong to the requested project", async () => {
    const issue = makeIssue({
      projectId: otherProjectId,
    })
    const { repository: issueRepository } = createFakeIssueRepository([issue])
    const { repository: evaluationRepository } = createFakeEvaluationRepository()

    await expect(
      Effect.runPromise(
        applyIssueLifecycleCommandUseCase({
          projectId,
          issueIds: [issue.id],
          command: "ignore",
        }).pipe(Effect.provide(makeProvider({ issueRepository, evaluationRepository }))),
      ),
    ).rejects.toMatchObject({
      _tag: "BadRequestError",
    })
  })
})
