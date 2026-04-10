import { EvaluationRepository } from "@domain/evaluations"
import { type IssueListItem, listIssuesUseCase } from "@domain/issues"
import { OrganizationId, ProjectId } from "@domain/shared"
import { ScoreAnalyticsRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { EvaluationRepositoryLive, IssueRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getClickhouseClient, getPostgresClient } from "../../server/clients.ts"
import {
  type EvaluationSummaryRecord,
  toEvaluationSummaryRecord,
} from "../evaluations/evaluation-alignment.functions.ts"

const listIssuesInputSchema = z.object({
  projectId: z.string(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().optional(),
})

const toIssueRecord = (issue: IssueListItem, evaluations: readonly EvaluationSummaryRecord[] = []) => ({
  id: issue.id,
  projectId: issue.projectId,
  name: issue.name,
  description: issue.description,
  states: issue.states,
  createdAt: issue.createdAt.toISOString(),
  updatedAt: issue.updatedAt.toISOString(),
  escalatedAt: issue.escalatedAt?.toISOString() ?? null,
  resolvedAt: issue.resolvedAt?.toISOString() ?? null,
  ignoredAt: issue.ignoredAt?.toISOString() ?? null,
  evaluations,
})

export type IssueRecord = ReturnType<typeof toIssueRecord>

export const listIssues = createServerFn({ method: "GET" })
  .inputValidator(listIssuesInputSchema)
  .handler(async ({ data }): Promise<readonly IssueRecord[]> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const pgClient = getPostgresClient()
    const chClient = getClickhouseClient()
    const projectId = ProjectId(data.projectId)

    const { issuesPage, evaluationsPage } = await Effect.runPromise(
      Effect.gen(function* () {
        const evaluationRepository = yield* EvaluationRepository

        return {
          issuesPage: yield* listIssuesUseCase({
            organizationId: orgId,
            projectId,
            limit: data.limit ?? 50,
            offset: data.offset ?? 0,
          }),
          evaluationsPage: yield* evaluationRepository.listByProjectId({
            projectId,
            options: {
              lifecycle: "all",
              limit: 1000,
            },
          }),
        }
      }).pipe(
        withPostgres(Layer.mergeAll(IssueRepositoryLive, EvaluationRepositoryLive), pgClient, orgId),
        withClickHouse(ScoreAnalyticsRepositoryLive, chClient, orgId),
      ),
    )

    const evaluationsByIssueId = new Map<string, EvaluationSummaryRecord[]>()
    for (const evaluation of evaluationsPage.items) {
      const evaluations = evaluationsByIssueId.get(evaluation.issueId) ?? []
      evaluations.push(toEvaluationSummaryRecord(evaluation))
      evaluationsByIssueId.set(evaluation.issueId, evaluations)
    }

    return issuesPage.items.map((issue) => toIssueRecord(issue, evaluationsByIssueId.get(issue.id) ?? []))
  })
