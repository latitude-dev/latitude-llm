import { type Issue, listIssuesUseCase } from "@domain/issues"
import { ProjectId } from "@domain/shared"
import { IssueRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"

const toRecord = (issue: Issue) => ({
  id: issue.id as string,
  name: issue.name,
  description: issue.description,
  resolvedAt: issue.resolvedAt ? issue.resolvedAt.toISOString() : null,
  ignoredAt: issue.ignoredAt ? issue.ignoredAt.toISOString() : null,
})

type IssueRecord = ReturnType<typeof toRecord>

export const listIssues = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }),
  )
  .handler(async ({ data }): Promise<IssueRecord[]> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const result = await Effect.runPromise(
      listIssuesUseCase({
        projectId: ProjectId(data.projectId),
        limit: data.limit ?? 50,
        offset: data.offset ?? 0,
      }).pipe(withPostgres(IssueRepositoryLive, client, organizationId)),
    )

    return result.items.map(toRecord)
  })
