import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import type { Issue } from "../entities/issue.ts"
import type { IssueRepositoryShape } from "../ports/issue-repository.ts"

export const createFakeIssueRepository = (seed: readonly Issue[] = [], overrides?: Partial<IssueRepositoryShape>) => {
  const issues = new Map<string, Issue>(seed.map((issue) => [issue.id, issue] as const))

  const repository: IssueRepositoryShape = {
    findById: (id) =>
      Effect.gen(function* () {
        const issue = issues.get(id)
        if (!issue) return yield* new NotFoundError({ entity: "Issue", id })
        return issue
      }),

    findByIdForUpdate: (id) =>
      Effect.gen(function* () {
        const issue = issues.get(id)
        if (!issue) return yield* new NotFoundError({ entity: "Issue", id })
        return issue
      }),

    findByUuid: ({ projectId, uuid }) =>
      Effect.gen(function* () {
        const issue = [...issues.values()].find((i) => i.projectId === projectId && i.uuid === uuid)
        if (!issue) return yield* new NotFoundError({ entity: "Issue", id: uuid })
        return issue
      }),

    save: (issue) =>
      Effect.sync(() => {
        issues.set(issue.id, issue)
      }),

    list: ({ projectId, limit, offset }) =>
      Effect.sync(() => {
        const rows = [...issues.values()]
          .filter((issue) => issue.projectId === projectId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        const window = rows.slice(offset, offset + limit + 1)
        return {
          items: window.slice(0, limit),
          hasMore: window.length > limit,
          limit,
          offset,
        }
      }),

    ...overrides,
  }

  return { repository, issues }
}
