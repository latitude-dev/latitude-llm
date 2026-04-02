import { cuidSchema, ProjectId, type RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { type IssueListPage, IssueRepository } from "../ports/issue-repository.ts"

const listIssuesInputSchema = z.object({
  projectId: cuidSchema.transform(ProjectId),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
})

export type ListIssuesInput = z.input<typeof listIssuesInputSchema>
export type ListIssuesError = RepositoryError

export const listIssuesUseCase = (
  input: ListIssuesInput,
): Effect.Effect<IssueListPage, ListIssuesError, IssueRepository> =>
  Effect.gen(function* () {
    const parsed = listIssuesInputSchema.parse(input)
    const repo = yield* IssueRepository

    return yield* repo.list({
      projectId: parsed.projectId,
      limit: parsed.limit,
      offset: parsed.offset,
    })
  })
