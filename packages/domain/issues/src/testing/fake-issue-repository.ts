import { RepositoryError } from "@domain/shared"
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

    ...overrides,
  }

  return { repository, issues }
}
