import {
  and,
  desc,
  eq,
  getTableColumns,
  isNotNull,
  isNull,
  lt,
  ne,
  sql,
} from 'drizzle-orm'
import { EvaluationV2 } from '../browser'
import { NotFoundError, Result } from '../lib'
import { commits, evaluationVersions, projects } from '../schema'
import { CommitsRepository } from './commitsRepository'
import Repository from './repositoryV2'

const tt = {
  ...getTableColumns(evaluationVersions),
  uuid: sql<string>`${evaluationVersions.evaluationUuid}`.as('uuid'),
  versionId: sql<number>`${evaluationVersions.id}::integer`.as('versionId'),
}

export class EvaluationsV2Repository extends Repository<EvaluationV2> {
  get scopeFilter() {
    return and(
      eq(evaluationVersions.workspaceId, this.workspaceId),
      isNull(evaluationVersions.deletedAt),
    )
  }

  get scope() {
    return this.db
      .select(tt)
      .from(evaluationVersions)
      .where(this.scopeFilter)
      .orderBy(desc(evaluationVersions.createdAt))
      .$dynamic()
  }

  async getAtCommitByDocument({
    projectId,
    commitUuid,
    documentUuid,
    evaluationUuid,
  }: {
    projectId?: number
    commitUuid: string
    documentUuid: string
    evaluationUuid: string
  }) {
    const evaluations = await this.listAtCommitByDocument({
      projectId: projectId,
      commitUuid: commitUuid,
      documentUuid: documentUuid,
    }).then((r) => r.unwrap())

    const evaluation = evaluations.find((e) => e.uuid === evaluationUuid)
    if (!evaluation) {
      return Result.error(new NotFoundError('Evaluation not found'))
    }

    return Result.ok<EvaluationV2>(evaluation)
  }

  async listAtCommitByDocument({
    projectId,
    commitUuid,
    documentUuid,
  }: {
    projectId?: number
    commitUuid: string
    documentUuid: string
  }) {
    const commitsRepository = new CommitsRepository(this.workspaceId, this.db)
    const commit = await commitsRepository
      .getCommitByUuid({
        projectId: projectId,
        uuid: commitUuid,
      })
      .then((r) => r.unwrap())

    const history = this.db.$with('history').as(
      this.db
        .select({
          id: commits.id,
          mergedAt: commits.mergedAt,
        })
        .from(commits)
        .innerJoin(projects, eq(projects.id, commits.projectId))
        .where(
          and(
            eq(projects.workspaceId, this.workspaceId),
            isNull(projects.deletedAt),
            eq(commits.projectId, commit.projectId),
            isNull(commits.deletedAt),
            isNotNull(commits.mergedAt),
            ...(commit.mergedAt ? [lt(commits.mergedAt, commit.mergedAt)] : []),
          ),
        ),
    )

    const historyVersions = await this.db
      .with(history)
      .selectDistinctOn([evaluationVersions.evaluationUuid], tt)
      .from(evaluationVersions)
      .innerJoin(history, eq(history.id, evaluationVersions.commitId))
      .where(
        and(
          eq(evaluationVersions.workspaceId, this.workspaceId),
          eq(evaluationVersions.documentUuid, documentUuid),
        ),
      )
      .orderBy(desc(evaluationVersions.evaluationUuid), desc(history.mergedAt))

    const currentVersions = await this.scope.where(
      and(
        eq(evaluationVersions.workspaceId, this.workspaceId),
        eq(evaluationVersions.commitId, commit.id),
        eq(evaluationVersions.documentUuid, documentUuid),
      ),
    )

    let evaluations = currentVersions.concat(
      historyVersions.filter(
        (oldVersion) =>
          !currentVersions.find(
            (newVersion) =>
              newVersion.evaluationUuid === oldVersion.evaluationUuid,
          ),
      ),
    )
    evaluations = evaluations.filter((e) => !e.deletedAt)
    evaluations = evaluations.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    )

    return Result.ok<EvaluationV2[]>(evaluations)
  }

  async existsAnotherVersion({
    commitId,
    evaluationUuid,
  }: {
    commitId: number
    evaluationUuid: string
  }) {
    const result = await this.db
      .select({ exists: sql<boolean>`TRUE` })
      .from(evaluationVersions)
      .where(
        and(
          eq(evaluationVersions.workspaceId, this.workspaceId),
          eq(evaluationVersions.evaluationUuid, evaluationUuid),
          ne(evaluationVersions.commitId, commitId),
        ),
      )
      .then((r) => r[0])

    return Result.ok<boolean>(!!result?.exists)
  }
}
