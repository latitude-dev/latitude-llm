import { and, desc, eq, isNotNull, isNull, or } from 'drizzle-orm'

import { Commit, DocumentVersion, Project } from '../../browser'
import { database } from '../../client'
import {
  CommitStatus,
  HEAD_COMMIT,
  ModifiedDocumentType,
} from '../../constants'
import { InferedReturnType, NotFoundError, Result } from '../../lib'
import { assertCommitIsDraft } from '../../lib/assertCommitIsDraft'
import {
  recomputeChanges,
  RecomputedChanges,
} from '../../services/documents/recomputeChanges'
import Repository from '../repository'
import { buildCommitsScope, columnSelection } from './utils/buildCommitsScope'
import { getHeadCommitForProject } from './utils/getHeadCommit'

const byErrors =
  (c: RecomputedChanges) => (a: DocumentVersion, b: DocumentVersion) => {
    const aErrors = c.errors[a.documentUuid]?.length ?? 0
    const bErrors = c.errors[b.documentUuid]?.length ?? 0
    return bErrors - aErrors
  }

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

export class CommitsRepository extends Repository<
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
      })
      .from(this.scope)
      .where(and(eq(this.scope.projectId, project.id), filter))
      .orderBy(desc(this.scope.createdAt))
  }

  async getChanges(id: number, tx = database) {
    const commitResult = await this.getCommitById(id)
    if (commitResult.error) return commitResult

    const commit = commitResult.value
    const isDraft = assertCommitIsDraft(commit)
    if (isDraft.error) return isDraft

    const result = await recomputeChanges(
      { draft: commit, workspaceId: this.workspaceId },
      tx,
    )
    if (result.error) return result

    const changes = result.value
    const head = changes.headDocuments.reduce(
      (acc, doc) => {
        acc[doc.documentUuid] = doc
        return acc
      },
      {} as Record<string, DocumentVersion>,
    )

    return Result.ok(
      changes.changedDocuments.sort(byErrors(changes)).map((changedDoc) => {
        const changeType = head[changedDoc.documentUuid]
          ? changedDoc.deletedAt
            ? ModifiedDocumentType.Deleted
            : ModifiedDocumentType.Updated
          : ModifiedDocumentType.Created

        return {
          documentUuid: changedDoc.documentUuid,
          path: changedDoc.path,
          errors: changes.errors[changedDoc.documentUuid]?.length ?? 0,
          changeType,
        }
      }),
    )
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
