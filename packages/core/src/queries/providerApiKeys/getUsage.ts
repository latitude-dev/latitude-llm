import {
  and,
  desc,
  eq,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm'

import { EvaluationType, type ProviderApiKeyUsage } from '../../constants'
import { commits } from '../../schema/models/commits'
import { documentVersions } from '../../schema/models/documentVersions'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { projects } from '../../schema/models/projects'
import { scopedQuery } from '../scope'

export const getProviderApiKeyUsage = scopedQuery(
  async function getProviderApiKeyUsage(
    {
      workspaceId,
      name,
    }: { workspaceId: number; name: string },
    db,
  ): Promise<ProviderApiKeyUsage> {
    const mergedCommits = db.$with('merged_commits').as(
      db
        .select({
          projectId: commits.projectId,
          projectName: projects.name,
          commitId: commits.id,
          commitUuid: commits.uuid,
          mergedAt: commits.mergedAt,
          deletedAt: commits.deletedAt,
        })
        .from(commits)
        .innerJoin(projects, eq(projects.id, commits.projectId))
        .where(
          and(
            isNull(projects.deletedAt),
            eq(projects.workspaceId, workspaceId),
            isNull(commits.deletedAt),
            isNotNull(commits.mergedAt),
          ),
        ),
    )

    const liveCommits = db
      .$with('live_commits')
      .as(
        db
          .with(mergedCommits)
          .selectDistinctOn(
            [mergedCommits.projectId],
            mergedCommits._.selectedFields,
          )
          .from(mergedCommits)
          .orderBy(
            desc(mergedCommits.projectId),
            desc(mergedCommits.mergedAt),
          ),
      )

    const liveDocuments = db.$with('live_documents').as(
      db
        .with(mergedCommits)
        .selectDistinctOn([documentVersions.documentUuid], {
          projectId: mergedCommits.projectId,
          commitId: documentVersions.commitId,
          documentUuid: documentVersions.documentUuid,
          documentPath: documentVersions.path,
          updatedAt: documentVersions.updatedAt,
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

    const liveEvaluations = db.$with('live_evaluations').as(
      db
        .with(mergedCommits)
        .selectDistinctOn([evaluationVersions.evaluationUuid], {
          projectId: mergedCommits.projectId,
          commitId: evaluationVersions.commitId,
          documentUuid: evaluationVersions.documentUuid,
          evaluationUuid: evaluationVersions.evaluationUuid,
          evaluationName: evaluationVersions.name,
          evaluationType: evaluationVersions.type,
          evaluationProvider: sql<
            string | null
          >`${evaluationVersions.configuration}->>'provider'`.as('provider'),
          updatedAt: evaluationVersions.updatedAt,
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

    const evaluations = await db
      .with(liveCommits, liveDocuments, liveEvaluations)
      .select({
        projectId: liveCommits.projectId,
        projectName: liveCommits.projectName,
        commitUuid: liveCommits.commitUuid,
        documentUuid: liveDocuments.documentUuid,
        documentPath: liveDocuments.documentPath,
        evaluationUuid: liveEvaluations.evaluationUuid,
        evaluationName: liveEvaluations.evaluationName,
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
          eq(liveEvaluations.evaluationType, EvaluationType.Llm),
          eq(liveEvaluations.evaluationProvider, name),
        ),
      )
      .orderBy(desc(liveEvaluations.updatedAt))

    return evaluations as ProviderApiKeyUsage
  },
)
