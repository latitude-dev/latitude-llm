import { Job } from 'bullmq'
import { subDays } from 'date-fns'
import {
  and,
  desc,
  eq,
  exists,
  gte,
  isNotNull,
  isNull,
  notExists,
  sql,
} from 'drizzle-orm'
import {
  DOCUMENT_SUGGESTION_EXPIRATION_DAYS,
  EVALUATION_RESULT_RECENCY_DAYS,
} from '../../../browser'
import { database } from '../../../client'
import { setupJobs } from '../../../jobs'
import {
  commits,
  connectedEvaluations,
  documentSuggestions,
  documentVersions,
  evaluationResults,
  projects,
} from '../../../schema'
import { generateDocumentSuggestionJobKey } from './generateDocumentSuggestionJob'

export type RequestDocumentSuggestionsJobData = {}

export const requestDocumentSuggestionsJob = async (
  _: Job<RequestDocumentSuggestionsJobData>,
) => {
  const projectsCte = database.$with('projects_cte').as(
    database
      .select({
        id: projects.id,
        workspaceId: projects.workspaceId,
      })
      .from(projects)
      .where(isNull(projects.deletedAt)),
  )
  const commitsCte = database.$with('commits_cte').as(
    database
      .select({
        id: commits.id,
        projectId: commits.projectId,
        mergedAt: commits.mergedAt,
      })
      .from(commits)
      .where(and(isNull(commits.deletedAt), isNotNull(commits.mergedAt))),
  )
  // Note: just coarse-grained filter here
  const hasRecentResults = exists(
    database
      .select({ exists: sql`TRUE` })
      .from(evaluationResults)
      .where(
        and(
          eq(evaluationResults.evaluationId, connectedEvaluations.evaluationId),
          gte(
            evaluationResults.updatedAt,
            subDays(new Date(), EVALUATION_RESULT_RECENCY_DAYS),
          ),
        ),
      ),
  )
  const evaluationsCte = database.$with('evaluations_cte').as(
    database
      .select({
        id: connectedEvaluations.evaluationId,
        documentUuid: connectedEvaluations.documentUuid,
      })
      .from(connectedEvaluations)
      .where(
        and(
          isNull(connectedEvaluations.deletedAt),
          eq(connectedEvaluations.live, true),
          hasRecentResults,
        ),
      ),
  )
  // Note: just coarse-grained filter here
  const notHasRecentSuggestions = notExists(
    database
      .select({ exists: sql`TRUE` })
      .from(documentSuggestions)
      .where(
        and(
          eq(documentSuggestions.commitId, documentVersions.commitId),
          eq(documentSuggestions.documentUuid, documentVersions.documentUuid),
          eq(documentSuggestions.evaluationId, evaluationsCte.id),
          gte(
            documentSuggestions.createdAt,
            subDays(new Date(), DOCUMENT_SUGGESTION_EXPIRATION_DAYS),
          ),
        ),
      ),
  )
  const candidates = await database
    .with(commitsCte, projectsCte, evaluationsCte)
    .selectDistinctOn([documentVersions.documentUuid, evaluationsCte.id], {
      workspaceId: projectsCte.workspaceId,
      commitId: documentVersions.commitId,
      documentUuid: documentVersions.documentUuid,
      evaluationId: evaluationsCte.id,
    })
    .from(documentVersions)
    .innerJoin(commitsCte, eq(commitsCte.id, documentVersions.commitId))
    .innerJoin(projectsCte, eq(projectsCte.id, commitsCte.projectId))
    .innerJoin(
      evaluationsCte,
      eq(evaluationsCte.documentUuid, documentVersions.documentUuid),
    )
    .where(and(isNull(documentVersions.deletedAt), notHasRecentSuggestions))
    .orderBy(
      desc(documentVersions.documentUuid),
      desc(evaluationsCte.id),
      desc(commitsCte.mergedAt),
    )

  const queues = await setupJobs()
  for (const candidate of candidates) {
    queues.defaultQueue.jobs.enqueueGenerateDocumentSuggestionJob(
      {
        workspaceId: candidate.workspaceId,
        commitId: candidate.commitId,
        documentUuid: candidate.documentUuid,
        evaluationId: candidate.evaluationId,
      },
      {
        attempts: 1,
        deduplication: {
          id: generateDocumentSuggestionJobKey({
            workspaceId: candidate.workspaceId,
            commitId: candidate.commitId,
            documentUuid: candidate.documentUuid,
            evaluationId: candidate.evaluationId,
          }),
        },
      },
    )
  }
}
