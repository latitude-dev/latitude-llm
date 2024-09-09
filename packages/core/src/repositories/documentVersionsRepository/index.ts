import { and, eq, getTableColumns, isNotNull, lte, max, sql } from 'drizzle-orm'

import { Commit, DocumentVersion } from '../../browser'
import { NotFoundError, Result } from '../../lib'
import { commits, documentVersions, projects } from '../../schema'
import { CommitsRepository } from '../commitsRepository'
import Repository from '../repository'

function mergeDocuments(
  ...documentsArr: DocumentVersion[][]
): DocumentVersion[] {
  return documentsArr.reduce((acc, documents) => {
    return acc
      .filter((d) => {
        return !documents.find((d2) => d2.documentUuid === d.documentUuid)
      })
      .concat(documents)
  }, [])
}

export type GetDocumentAtCommitProps = {
  projectId?: number
  commitUuid: string
  documentUuid: string
}

const tt = {
  ...getTableColumns(documentVersions),
  mergedAt: commits.mergedAt,
  // Dear developer,
  //
  // This is the way to select columns from a table with an alias in
  // drizzle-orm, which is hot garbage, but it works. We need it otherwise the
  // resulting subquery returns two columns with the same name id and we can't
  // use it in a join.
  projectId: sql<number>`${projects.id}::int`.as('projectId'),
}

export class DocumentVersionsRepository extends Repository<
  typeof tt,
  DocumentVersion & { mergedAt: Date | null; projectId: number }
> {
  get scope() {
    return this.db
      .select(tt)
      .from(documentVersions)
      .innerJoin(projects, eq(projects.workspaceId, this.workspaceId))
      .innerJoin(commits, eq(commits.projectId, projects.id))
      .where(eq(documentVersions.commitId, commits.id))
      .as('documentVersionsScope')
  }

  async getDocumentById(documentId: number) {
    const res = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.id, documentId))

    // NOTE: I hate this
    const document = res[0]
    if (!document) return Result.error(new NotFoundError('Document not found'))

    return Result.ok(document)
  }

  async getDocumentByUuid({
    commit,
    documentUuid,
  }: {
    commit: Commit
    documentUuid: string
  }) {
    const document = await this.db
      .select()
      .from(this.scope)
      .where(
        and(
          eq(this.scope.commitId, commit.id),
          eq(this.scope.documentUuid, documentUuid),
        ),
      )
      .limit(1)
      .then((docs) => docs[0])

    if (!document) return Result.error(new NotFoundError('Document not found'))

    return Result.ok(document)
  }

  async getDocumentByPath({ commit, path }: { commit: Commit; path: string }) {
    try {
      const result = await this.getDocumentsAtCommit(commit)
      const documents = result.unwrap()
      const document = documents.find((doc) => doc.path === path)
      if (!document) {
        return Result.error(
          new NotFoundError(
            `No document with path ${path} at commit ${commit.uuid}`,
          ),
        )
      }

      return Result.ok(document!)
    } catch (err) {
      return Result.error(err as Error)
    }
  }

  /**
   * NOTE: By default we don't include deleted documents
   */
  async getDocumentsAtCommit(commit: Commit) {
    const result = await this.getAllDocumentsAtCommit({ commit })
    if (result.error) return result

    return Result.ok(result.value.filter((d) => d.deletedAt === null))
  }

  async getDocumentAtCommit({
    projectId,
    commitUuid,
    documentUuid,
  }: GetDocumentAtCommitProps) {
    const commitsScope = new CommitsRepository(this.workspaceId)
    const commitResult = await commitsScope.getCommitByUuid({
      projectId,
      uuid: commitUuid,
    })
    if (commitResult.error) return commitResult
    const commit = commitResult.unwrap()

    const documentInCommit = await this.db
      .select()
      .from(this.scope)
      .where(
        and(
          eq(this.scope.commitId, commit.id),
          eq(this.scope.documentUuid, documentUuid),
        ),
      )
      .limit(1)
      .then((docs) => docs[0])
    if (documentInCommit !== undefined) return Result.ok(documentInCommit)

    const documents = await this.getDocumentsAtCommit(commit).then((r) =>
      r.unwrap(),
    )
    const document = documents.find((d) => d.documentUuid === documentUuid)
    if (!document) return Result.error(new NotFoundError('Document not found'))

    return Result.ok(document)
  }

  async listCommitChanges(commit: Commit) {
    const changedDocuments = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.commitId, commit.id))

    return Result.ok(changedDocuments)
  }

  private async getAllDocumentsAtCommit({ commit }: { commit: Commit }) {
    const documentsFromMergedCommits = await this.getDocumentsFromMergedCommits(
      {
        projectId: commit.projectId,
        maxMergedAt: commit.mergedAt,
      },
    ).then((r) => r.unwrap())

    if (commit.mergedAt !== null) {
      // Referenced commit is merged. No additional documents to return.
      return Result.ok(documentsFromMergedCommits)
    }

    const documentsFromDraft = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.commitId, commit.id))

    const totalDocuments = mergeDocuments(
      documentsFromMergedCommits,
      documentsFromDraft,
    )

    return Result.ok(totalDocuments)
  }

  async getDocumentsFromMergedCommits({
    projectId,
    maxMergedAt,
  }: {
    projectId?: number
    maxMergedAt?: Date | null
  } = {}) {
    const filterByMaxMergedAt = () => {
      const mergedAtNotNull = isNotNull(this.scope.mergedAt)
      if (!maxMergedAt) return mergedAtNotNull

      return and(mergedAtNotNull, lte(this.scope.mergedAt, maxMergedAt))
    }

    const filterByproject = () =>
      projectId ? eq(this.scope.projectId, projectId) : undefined

    const lastVersionOfEachDocument = this.db
      .$with('lastVersionOfDocuments')
      .as(
        this.db
          .select({
            documentUuid: this.scope.documentUuid,
            mergedAt: max(this.scope.mergedAt).as('maxMergedAt'),
          })
          .from(this.scope)
          .where(and(filterByMaxMergedAt(), filterByproject()))
          .groupBy(this.scope.documentUuid),
      )

    const documentsFromMergedCommits = await this.db
      .with(lastVersionOfEachDocument)
      .select(this.scope._.selectedFields)
      .from(this.scope)
      .innerJoin(documentVersions, eq(this.scope.id, documentVersions.id))
      .innerJoin(projects, eq(this.scope.projectId, projects.id))
      .innerJoin(
        lastVersionOfEachDocument,
        and(
          eq(this.scope.documentUuid, lastVersionOfEachDocument.documentUuid),
          eq(this.scope.mergedAt, lastVersionOfEachDocument.mergedAt),
        ),
      )
      .where(isNotNull(this.scope.mergedAt))

    return Result.ok(documentsFromMergedCommits)
  }
}
