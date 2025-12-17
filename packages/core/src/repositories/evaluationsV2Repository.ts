import { differenceInMilliseconds } from 'date-fns'
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
import { EvaluationType, EvaluationV2 } from '../constants'
import { NotFoundError } from '../lib/errors'
import { Result } from '../lib/Result'
import { commits } from '../schema/models/commits'
import { evaluationVersions } from '../schema/models/evaluationVersions'
import { projects } from '../schema/models/projects'
import { type Commit } from '../schema/models/types/Commit'
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
      .orderBy(desc(evaluationVersions.createdAt), desc(evaluationVersions.id))
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
    documentUuid?: string
    evaluationUuid: string
  }) {
    const evaluations = await this.list({
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

  async list({
    projectId,
    commitUuid,
    documentUuid,
  }: {
    projectId?: number
    commitUuid: string
    documentUuid?: string
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
          ...(documentUuid
            ? [eq(evaluationVersions.documentUuid, documentUuid)]
            : []),
        ),
      )
      .orderBy(desc(evaluationVersions.evaluationUuid), desc(history.mergedAt))

    const currentVersions = await this.scope.where(
      and(
        eq(evaluationVersions.workspaceId, this.workspaceId),
        eq(evaluationVersions.commitId, commit.id),
        ...(documentUuid
          ? [eq(evaluationVersions.documentUuid, documentUuid)]
          : []),
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
    evaluations = evaluations.sort((a, b) =>
      differenceInMilliseconds(b.createdAt, a.createdAt),
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
          // Not using this.scopeFilter because we want to receive deleted evaluations too
          eq(evaluationVersions.workspaceId, this.workspaceId),
          eq(evaluationVersions.evaluationUuid, evaluationUuid),
          ne(evaluationVersions.commitId, commitId),
        ),
      )
      .limit(1)
      .then((r) => r[0])

    return Result.ok<boolean>(!!result?.exists)
  }

  async getChangesInCommit(commit: Commit) {
    const result = await this.db
      .select(tt)
      .from(evaluationVersions)
      .where(
        // Not using this.scopeFilter because we want to receive deleted evaluations too
        and(
          eq(evaluationVersions.workspaceId, this.workspaceId),
          eq(evaluationVersions.commitId, commit.id),
        ),
      )
      .orderBy(desc(evaluationVersions.createdAt), desc(evaluationVersions.id))

    return Result.ok<EvaluationV2[]>(result)
  }

  async getByIssue(issueId: number) {
    return await this.db
      .select(tt)
      .from(evaluationVersions)
      .where(
        and(
          eq(evaluationVersions.workspaceId, this.workspaceId),
          eq(evaluationVersions.issueId, issueId),
        ),
      )
  }

  async getDefaultCompositeTarget({
    projectId,
    commitUuid,
    documentUuid,
  }: {
    projectId?: number
    commitUuid: string
    documentUuid: string
  }) {
    const evaluations = await this.list({
      projectId: projectId,
      commitUuid: commitUuid,
      documentUuid: documentUuid,
    }).then((r) => r.unwrap())

    const target = evaluations.find(
      (e) =>
        e.type === EvaluationType.Composite &&
        !!(e as EvaluationV2<EvaluationType.Composite>).configuration
          .defaultTarget,
    ) as EvaluationV2<EvaluationType.Composite> | undefined

    return Result.ok<EvaluationV2<EvaluationType.Composite> | undefined>(target)
  }
}
