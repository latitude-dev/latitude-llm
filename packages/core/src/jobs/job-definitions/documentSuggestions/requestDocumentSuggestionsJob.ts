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
import {
  commits,
  documentSuggestions,
  documentVersions,
  evaluationResultsV2,
  evaluationVersions,
  projects,
} from '../../../schema'
import { generateDocumentSuggestionJobKey } from './generateDocumentSuggestionJob'
import { documentSuggestionsQueue } from '../../queues'

export type RequestDocumentSuggestionsJobData = {}

// TODO(evalsv2): Add tests
export const requestDocumentSuggestionsJob = async (
  _: Job<RequestDocumentSuggestionsJobData>,
) => {
  const mergedCommits = database.$with('merged_commits').as(
    database
      .select({
        workspaceId: projects.workspaceId,
        projectId: commits.projectId, // Note: cannot be projects.id because drizzle does not alias the columns so postgres cannot disambiguate: https://github.com/drizzle-team/drizzle-orm/issues/3731
        commitId: commits.id,
        mergedAt: commits.mergedAt,
        deletedAt: commits.deletedAt,
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

  const liveCommits = database.$with('live_commits').as(
    database
      .with(mergedCommits)
      .selectDistinctOn([mergedCommits.projectId], {
        workspaceId: mergedCommits.workspaceId,
        projectId: mergedCommits.projectId,
        commitId: mergedCommits.commitId,
        mergedAt: mergedCommits.mergedAt,
        deletedAt: mergedCommits.deletedAt,
      })
      .from(mergedCommits)
      .orderBy(desc(mergedCommits.projectId), desc(mergedCommits.mergedAt)),
  )

  const liveDocuments = database.$with('live_documents').as(
    database
      .with(mergedCommits)
      .selectDistinctOn([documentVersions.documentUuid], {
        workspaceId: mergedCommits.workspaceId,
        projectId: mergedCommits.projectId,
        commitId: documentVersions.commitId,
        documentUuid: documentVersions.documentUuid,
        deletedAt: documentVersions.deletedAt,
      })
      .from(documentVersions)
      .innerJoin(
        mergedCommits,
        eq(mergedCommits.commitId, documentVersions.commitId),
      )
      .orderBy(
        desc(documentVersions.documentUuid),
        desc(mergedCommits.mergedAt),
      ),
  )

  const liveEvaluations = database.$with('live_evaluations').as(
    database
      .with(mergedCommits)
      .selectDistinctOn([evaluationVersions.evaluationUuid], {
        workspaceId: mergedCommits.workspaceId,
        projectId: mergedCommits.projectId,
        commitId: evaluationVersions.commitId,
        documentUuid: evaluationVersions.documentUuid,
        evaluationUuid: evaluationVersions.evaluationUuid,
        enableSuggestions: evaluationVersions.enableSuggestions,
        deletedAt: evaluationVersions.deletedAt,
      })
      .from(evaluationVersions)
      .innerJoin(
        mergedCommits,
        eq(mergedCommits.commitId, evaluationVersions.commitId),
      )
      .orderBy(
        desc(evaluationVersions.evaluationUuid),
        desc(mergedCommits.mergedAt),
      ),
  )

  // Note: just coarse-grained filter here
  const hasRecentResultsV2 = exists(
    database
      .select({ exists: sql`TRUE` })
      .from(evaluationResultsV2)
      .where(
        and(
          eq(evaluationResultsV2.commitId, liveCommits.commitId),
          eq(
            evaluationResultsV2.evaluationUuid,
            liveEvaluations.evaluationUuid,
          ),
          gte(
            evaluationResultsV2.createdAt,
            subDays(new Date(), EVALUATION_RESULT_RECENCY_DAYS),
          ),
        ),
      ),
  )

  // Note: just coarse-grained filter here
  const notHasRecentSuggestionsV2 = notExists(
    database
      .select({ exists: sql`TRUE` })
      .from(documentSuggestions)
      .where(
        and(
          eq(documentSuggestions.commitId, liveDocuments.commitId),
          eq(documentSuggestions.documentUuid, liveDocuments.documentUuid),
          eq(
            documentSuggestions.evaluationUuid,
            liveEvaluations.evaluationUuid,
          ),
          gte(
            documentSuggestions.createdAt,
            subDays(new Date(), DOCUMENT_SUGGESTION_EXPIRATION_DAYS),
          ),
        ),
      ),
  )

  const candidatesV2 = await database
    .with(liveCommits, liveDocuments, liveEvaluations)
    .select({
      workspaceId: liveCommits.workspaceId,
      commitId: liveCommits.commitId,
      documentUuid: liveDocuments.documentUuid,
      evaluationUuid: liveEvaluations.evaluationUuid,
    })
    .from(liveCommits)
    .innerJoin(
      liveDocuments,
      eq(liveDocuments.projectId, liveCommits.projectId),
    )
    .innerJoin(
      liveEvaluations,
      eq(liveEvaluations.documentUuid, liveDocuments.documentUuid),
    )
    .where(
      and(
        isNull(liveCommits.deletedAt),
        isNull(liveDocuments.deletedAt),
        isNull(liveEvaluations.deletedAt),
        eq(liveEvaluations.enableSuggestions, true),
        hasRecentResultsV2,
        notHasRecentSuggestionsV2,
      ),
    )

  for (const candidate of candidatesV2) {
    documentSuggestionsQueue.add('generateDocumentSuggestionJob', candidate, {
      attempts: 1,
      deduplication: {
        id: generateDocumentSuggestionJobKey(candidate),
      },
    })
  }
}
