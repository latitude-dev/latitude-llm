import {
  and,
  desc,
  eq,
  exists,
  isNotNull,
  isNull,
  lt,
  not,
  or,
} from 'drizzle-orm'

import { Commit, Project } from '../../browser'
import {
  CommitStatus,
  HEAD_COMMIT,
  ModifiedDocumentType,
} from '../../constants'
import RepositoryLegacy from '../repository'
import { buildCommitsScope, columnSelection } from './utils/buildCommitsScope'
import { getHeadCommitForProject } from './utils/getHeadCommit'
import { documentVersions } from '../../schema'
import { InferedReturnType } from './../../lib/commonTypes'
import { NotFoundError } from './../../lib/errors'
import { Result } from './../../lib/Result'

export type ChangedDocument = {
  documentUuid: string
  path: string
  errors: number
  changeType: ModifiedDocumentType
}
function filterByStatusQuery({
  scope,
  status,
}: {
  status: CommitStatus
  scope: InferedReturnType<typeof buildCommitsScope>
}) {
  switch (status) {
    case CommitStatus.Draft:
      return isNull(scope.mergedAt)
    case CommitStatus.Merged:
      return isNotNull(scope.mergedAt)
    default:
      return or(isNotNull(scope.mergedAt), isNull(scope.mergedAt))
  }
}

export class CommitsRepository extends RepositoryLegacy<
  typeof columnSelection,
  Commit
> {
  get scope() {
    return buildCommitsScope(this.workspaceId, this.db)
  }

  async getHeadCommit(projectId: number) {
    return getHeadCommitForProject(
      { projectId, commitsScope: this.scope },
      this.db,
    )
  }

  async getCommitByUuid({
    uuid,
    projectId,
  }: {
    projectId?: number
    uuid: string
  }) {
    if (uuid === HEAD_COMMIT) {
      if (!projectId) {
        return Result.error(new NotFoundError('Project ID is required'))
      }

      const headCommit = await this.getHeadCommit(projectId).then((r) =>
        r.unwrap(),
      )
      if (!headCommit) {
        return Result.error(new NotFoundError('Head commit not found'))
      }

      return Result.ok(headCommit)
    }

    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.uuid, uuid))
      .limit(1)
    const commit = result[0]
    if (!commit)
      return Result.error(
        new NotFoundError(`Commit with uuid ${uuid} not found`),
      )

    return Result.ok(commit)
  }

  async getCommitById(id: number) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.id, id))
      .limit(1)
    const commit = result[0]
    if (!commit) return Result.error(new NotFoundError('Commit not found'))

    return Result.ok(commit)
  }

  async getCommits() {
    return this.db.select().from(this.scope)
  }

  async getFirstCommitForProject(project: Project) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.projectId, project.id))
      .orderBy(this.scope.createdAt)
      .limit(1)

    if (result.length < 1) {
      return Result.error(new NotFoundError('No commits found'))
    }

    return Result.ok(result[0]!)
  }

  getCommitsWithDocumentChanges({
    project,
    documentUuid,
  }: {
    project: Project
    documentUuid: string
  }) {
    return this.db
      .select()
      .from(this.scope)
      .where(
        and(
          eq(this.scope.projectId, project.id),
          exists(
            this.db
              .select()
              .from(documentVersions)
              .where(
                and(
                  eq(documentVersions.documentUuid, documentUuid),
                  eq(documentVersions.commitId, this.scope.id),
                ),
              ),
          ),
        ),
      )
      .orderBy(desc(this.scope.createdAt))
  }

  async getPreviousCommit(commit: Commit): Promise<Commit | undefined> {
    const mergedAtFilter = commit.mergedAt
      ? lt(this.scope.mergedAt, commit.mergedAt)
      : isNotNull(this.scope.mergedAt)

    return this.db
      .select()
      .from(this.scope)
      .where(
        and(
          eq(this.scope.projectId, commit.projectId),
          mergedAtFilter,
          not(eq(this.scope.id, commit.id)),
        ),
      )
      .orderBy(desc(this.scope.mergedAt))
      .limit(1)
      .then((r) => r[0])
  }

  getCommitsByProjectQuery({
    project,
    filterByStatus = CommitStatus.All,
  }: {
    project: Project
    filterByStatus?: CommitStatus
  }) {
    const filter = filterByStatusQuery({
      scope: this.scope,
      status: filterByStatus,
    })
    return this.db
      .select({
        id: this.scope.id,
        uuid: this.scope.uuid,
        title: this.scope.title,
        version: this.scope.version,
        description: this.scope.description,
        projectId: this.scope.projectId,
        userId: this.scope.userId,
        mergedAt: this.scope.mergedAt,
        createdAt: this.scope.createdAt,
        updatedAt: this.scope.updatedAt,
        deletedAt: this.scope.deletedAt,
      })
      .from(this.scope)
      .where(and(eq(this.scope.projectId, project.id), filter))
      .orderBy(desc(this.scope.createdAt))
  }

  async filterByProject(projectId: number) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.projectId, projectId))
      .orderBy(desc(this.scope.mergedAt))

    return Result.ok(result)
  }
}
