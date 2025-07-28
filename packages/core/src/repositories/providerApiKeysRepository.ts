import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm'

import { EvaluationType, ProviderApiKey, ProviderApiKeyUsage } from '../browser'
import { NotFoundError } from '../lib/errors'
import { Result } from '../lib/Result'
import {
  commits,
  documentVersions,
  evaluationVersions,
  projects,
  providerApiKeys,
} from '../schema'
import RepositoryLegacy from './repository'

const tt = getTableColumns(providerApiKeys)

export class ProviderApiKeysRepository extends RepositoryLegacy<
  typeof tt,
  ProviderApiKey
> {
  get scope() {
    return this.db
      .select(tt)
      .from(providerApiKeys)
      .where(
        and(
          isNull(providerApiKeys.deletedAt),
          eq(providerApiKeys.workspaceId, this.workspaceId),
        ),
      )
      .as('providerApiKeysScope')
  }

  async findByName(name: string) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.name, name))

    if (!result.length) {
      return Result.error(
        new NotFoundError(`ProviderApiKey not found by name: "${name}"`),
      )
    }

    return Result.ok(result[0]!)
  }

  async findAllByNames(names: string[]) {
    return await this.db
      .select()
      .from(this.scope)
      .where(inArray(this.scope.name, names))
  }

  async getUsage(name: string) {
    const mergedCommits = this.db.$with('merged_commits').as(
      this.db
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
            eq(projects.workspaceId, this.workspaceId),
            isNull(commits.deletedAt),
            isNotNull(commits.mergedAt),
          ),
        ),
    )

    const liveCommits = this.db
      .$with('live_commits')
      .as(
        this.db
          .with(mergedCommits)
          .selectDistinctOn(
            [mergedCommits.projectId],
            mergedCommits._.selectedFields,
          )
          .from(mergedCommits)
          .orderBy(desc(mergedCommits.projectId), desc(mergedCommits.mergedAt)),
      )

    const liveDocuments = this.db.$with('live_documents').as(
      this.db
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

    // TODO: get documents when provider is denormalized in the schema

    const liveEvaluations = this.db.$with('live_evaluations').as(
      this.db
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

    const evaluations = await this.db
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

    const items = evaluations

    return Result.ok<ProviderApiKeyUsage>(items)
  }
}
