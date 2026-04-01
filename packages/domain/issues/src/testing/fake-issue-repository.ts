import { generateId, type IssueId, RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import type { Issue } from "../entities/issue.ts"
import type { IssueRepositoryShape } from "../ports/issue-repository.ts"

export const createFakeIssueRepository = (seed: readonly Issue[] = [], overrides?: Partial<IssueRepositoryShape>) => {
  const issues = new Map<string, Issue>(seed.map((issue) => [issue.id, issue] as const))

  const repository: IssueRepositoryShape = {
    findById: (id) =>
      Effect.try({
        try: () => issues.get(id) ?? null,
        catch: (cause) => new RepositoryError({ cause, operation: "IssueRepository.findById" }),
      }),

    findByUuid: ({ projectId, uuid }) =>
      Effect.try({
        try: () => [...issues.values()].find((issue) => issue.projectId === projectId && issue.uuid === uuid) ?? null,
        catch: (cause) => new RepositoryError({ cause, operation: "IssueRepository.findByUuid" }),
      }),

    save: (issue) =>
      Effect.try({
        try: () => {
          issues.set(issue.id, issue)
        },
        catch: (cause) => new RepositoryError({ cause, operation: "IssueRepository.save" }),
      }),

    list: ({ projectId, limit, offset, nameFilter }) =>
      Effect.try({
        try: () => {
          let rows = [...issues.values()].filter((i) => i.projectId === projectId)
          if (nameFilter && nameFilter.length > 0) {
            const q = nameFilter.toLowerCase()
            rows = rows.filter((i) => i.name.toLowerCase().includes(q))
          }
          rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          const window = rows.slice(offset, offset + limit + 1)
          return {
            items: window.slice(0, limit),
            hasMore: window.length > limit,
            limit,
            offset,
          }
        },
        catch: (cause) => new RepositoryError({ cause, operation: "IssueRepository.list" }),
      }),

    create: (input) =>
      Effect.try({
        try: () => {
          const now = new Date()
          const id = generateId() as IssueId
          const issue: Issue = {
            id,
            uuid: input.uuid,
            organizationId: input.organizationId,
            projectId: input.projectId,
            name: input.name,
            description: input.description,
            centroid: input.centroid,
            clusteredAt: input.clusteredAt,
            escalatedAt: null,
            resolvedAt: null,
            ignoredAt: null,
            createdAt: now,
            updatedAt: now,
          }
          issues.set(id, issue)
          return issue
        },
        catch: (cause) => new RepositoryError({ cause, operation: "IssueRepository.create" }),
      }),

    ...overrides,
  }

  return { repository, issues }
}
