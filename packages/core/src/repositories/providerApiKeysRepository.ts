import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  sql,
  SQL,
} from 'drizzle-orm'

import { type ProviderApiKey } from '../schema/models/types/ProviderApiKey'
import { EvaluationType, ProviderApiKeyUsage } from '../constants'
import { NotFoundError } from '../lib/errors'
import { Result } from '../lib/Result'
import { commits } from '../schema/models/commits'
import { documentVersions } from '../schema/models/documentVersions'
import { evaluationVersions } from '../schema/models/evaluationVersions'
import { projects } from '../schema/models/projects'
import { providerApiKeys } from '../schema/models/providerApiKeys'
import { decryptProviderToken } from '../services/providerApiKeys/helpers/tokenEncryption'
import Repository, { QueryOptions } from './repositoryV2'

const tt = getTableColumns(providerApiKeys)

export class ProviderApiKeysRepository extends Repository<ProviderApiKey> {
  get scopeFilter() {
    return and(
      isNull(providerApiKeys.deletedAt),
      eq(providerApiKeys.workspaceId, this.workspaceId),
    )
  }

  get scope() {
    return this.db
      .select(tt)
      .from(providerApiKeys)
      .where(this.scopeFilter)
      .$dynamic()
  }

  private decryptToken(apiKey: ProviderApiKey): ProviderApiKey {
    return {
      ...apiKey,
      token: decryptProviderToken(apiKey.token),
    }
  }

  private decryptTokens(apiKeys: ProviderApiKey[]): ProviderApiKey[] {
    return apiKeys.map((apiKey) => this.decryptToken(apiKey))
  }

  async findAll(opts: QueryOptions = {}) {
    const result = await super.findAll(opts)
    if (!Result.isOk(result)) return result
    return Result.ok(this.decryptTokens(result.value))
  }

  async find(id: string | number | undefined | null) {
    const result = await super.find(id)
    if (!Result.isOk(result)) return result
    return Result.ok(this.decryptToken(result.value))
  }

  async findMany(
    ids: (string | number)[],
    opts: { ordering?: SQL<unknown>[] } = {},
  ) {
    const result = await super.findMany(ids, opts)
    if (!Result.isOk(result)) return result
    return Result.ok(this.decryptTokens(result.value))
  }

  async findFirst() {
    const result = await super.findFirst()
    if (!Result.isOk(result)) return result
    return Result.ok(result.value ? this.decryptToken(result.value) : undefined)
  }

  async findByName(name: string) {
    const result = await this.scope.where(
      and(this.scopeFilter, eq(providerApiKeys.name, name)),
    )

    if (!result.length) {
      return Result.error(
        new NotFoundError(`ProviderApiKey not found by name: "${name}"`),
      )
    }

    return Result.ok(this.decryptToken(result[0]!))
  }

  async findAllByNames(names: string[]) {
    const result = await this.scope.where(
      and(this.scopeFilter, inArray(providerApiKeys.name, names)),
    )
    return this.decryptTokens(result)
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
