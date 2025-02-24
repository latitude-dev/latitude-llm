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
  const mergedCommits = database.$with('merged_commits').as(
    database
      .select({
        id: commits.id,
        workspaceId: projects.workspaceId,
        mergedAt: commits.mergedAt,
      })
      .from(commits)
      .innerJoin(projects, eq(projects.id, commits.projectId))
      .where(
        and(
          isNull(projects.deletedAt),
          isNull(commits.deletedAt),
          isNotNull(commits.mergedAt),
        ),
      ),
  )

  const liveDocuments = database.$with('live_documents').as(
    database
      .with(mergedCommits)
      .selectDistinctOn([documentVersions.documentUuid], {
        workspaceId: mergedCommits.workspaceId,
        commitId: documentVersions.commitId,
        documentUuid: documentVersions.documentUuid,
        deletedAt: documentVersions.deletedAt,
      })
      .from(documentVersions)
      .innerJoin(mergedCommits, eq(mergedCommits.id, documentVersions.commitId))
      .orderBy(
        desc(documentVersions.documentUuid),
        desc(mergedCommits.mergedAt),
      ),
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

  // Note: just coarse-grained filter here
  const notHasRecentSuggestions = notExists(
    database
      .select({ exists: sql`TRUE` })
      .from(documentSuggestions)
      .where(
        and(
          eq(documentSuggestions.commitId, liveDocuments.commitId),
          eq(documentSuggestions.documentUuid, liveDocuments.documentUuid),
          eq(
            documentSuggestions.evaluationId,
            connectedEvaluations.evaluationId,
          ),
          gte(
            documentSuggestions.createdAt,
            subDays(new Date(), DOCUMENT_SUGGESTION_EXPIRATION_DAYS),
          ),
        ),
      ),
  )

  const candidates = await database
    .with(liveDocuments)
    .select({
      workspaceId: liveDocuments.workspaceId,
      commitId: liveDocuments.commitId,
      documentUuid: liveDocuments.documentUuid,
      evaluationId: connectedEvaluations.evaluationId,
    })
    .from(connectedEvaluations)
    .innerJoin(
      liveDocuments,
      eq(liveDocuments.documentUuid, connectedEvaluations.documentUuid),
    )
    .where(
      and(
        isNull(connectedEvaluations.deletedAt),
        isNull(liveDocuments.deletedAt),
        eq(connectedEvaluations.live, true),
        hasRecentResults,
        notHasRecentSuggestions,
      ),
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
