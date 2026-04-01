import { cuidSchema, ProjectId, type RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { type IssueListPage, IssueRepository } from "../ports/issue-repository.ts"

const listProjectIssuesInputSchema = z.object({
  projectId: cuidSchema.transform(ProjectId),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  nameFilter: z.string().optional(),
})

export type ListProjectIssuesInput = z.input<typeof listProjectIssuesInputSchema>
export type ListProjectIssuesError = RepositoryError

export const listProjectIssuesUseCase = (
  input: ListProjectIssuesInput,
): Effect.Effect<IssueListPage, ListProjectIssuesError, IssueRepository> =>
  Effect.gen(function* () {
    const parsed = listProjectIssuesInputSchema.parse(input)
    const repo = yield* IssueRepository

    return yield* repo.list({
      projectId: parsed.projectId,
      limit: parsed.limit,
      offset: parsed.offset,
      nameFilter: parsed.nameFilter,
    })
  })
