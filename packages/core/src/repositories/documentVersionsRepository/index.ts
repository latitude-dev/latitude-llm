import {
  and,
  desc,
  eq,
  getTableColumns,
  isNotNull,
  isNull,
  lte,
  max,
  notInArray,
  sql,
} from 'drizzle-orm'

import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { database } from '../../client'
import {
  databaseErrorCodes,
  NotFoundError,
  UnprocessableEntityError,
} from '../../lib/errors'
import { Result } from '../../lib/Result'
import { commits } from '../../schema/models/commits'
import { documentVersions } from '../../schema/models/documentVersions'
import { projects } from '../../schema/models/projects'
import { CommitsRepository } from '../commitsRepository'
import RepositoryLegacy from '../repository'

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

type DocumentVersionsRepositoryOptions = {
  includeDeleted?: boolean
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

export class DocumentVersionsRepository extends RepositoryLegacy<
  typeof tt,
  DocumentVersion & { mergedAt: Date | null; projectId: number }
> {
  private opts: DocumentVersionsRepositoryOptions

  constructor(
    workspaceId: number,
    db = database,
    opts: DocumentVersionsRepositoryOptions = {},
  ) {
    super(workspaceId, db)
    this.opts = opts
  }

  get scope() {
    return this.db
      .select(tt)
      .from(documentVersions)
      .innerJoin(
        commits,
        and(
          eq(commits.id, documentVersions.commitId),
          this.opts.includeDeleted ? undefined : isNull(commits.deletedAt),
        ),
      )
      .innerJoin(projects, eq(projects.id, commits.projectId))
      .where(eq(projects.workspaceId, this.workspaceId))
      .as('documentVersionsScope')
  }

  async lock({
    commitId,
    documentUuid,
    wait,
  }: {
    commitId: number
    documentUuid: string
    wait?: boolean
  }) {
    // .for('no key update', { noWait: true }) is bugged in drizzle!
    // https://github.com/drizzle-team/drizzle-orm/issues/3554

    try {
      await this.db.execute(sql<boolean>`
        SELECT TRUE
        FROM ${documentVersions}
        INNER JOIN ${commits} ON ${commits.id} = ${documentVersions.commitId}
        INNER JOIN ${projects} ON ${projects.id} = ${commits.projectId}
        WHERE (
          ${projects.workspaceId} = ${this.workspaceId} AND
          ${documentVersions.commitId} = ${commitId} AND
          ${documentVersions.documentUuid} = ${documentUuid}
        ) LIMIT 1 FOR NO KEY UPDATE ${sql.raw(wait ? '' : 'NOWAIT')};
          `)
    } catch (error: any) {
      if (error?.code === databaseErrorCodes.lockNotAvailable) {
        return Result.error(
          new UnprocessableEntityError(
            'Cannot obtain lock on document version',
          ),
        )
      }
      return Result.error(error as Error)
    }

    return Result.nil()
  }

  async existsDocumentWithUuid(documentUuid: string) {
    if (
      !documentUuid.match(
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
      )
    ) {
      // Note: otherwise the comparison fails with "invalid input syntax for type uuid: 'non-existent-uuid'""
      return false
    }

    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.documentUuid, documentUuid))
      .limit(1)

    return result.length > 0
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

  async getDocumentByCompositedId({
    commitId,
    documentUuid,
  }: {
    commitId: number
    documentUuid: string
  }) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(
        and(
          eq(this.scope.commitId, commitId),
          eq(this.scope.documentUuid, documentUuid),
        ),
      )

    const document = result[0]
    if (!document) return Result.error(new NotFoundError('Document not found'))

    return Result.ok(document)
  }

  async getSomeDocumentByUuid({
    projectId,
    documentUuid,
  }: {
    projectId: number
    documentUuid: string
  }) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(
        and(
          eq(this.scope.projectId, projectId),
          eq(this.scope.documentUuid, documentUuid),
        ),
      )
      .limit(1)

    const document = result[0]
    if (!document) return Result.error(new NotFoundError('Document not found'))

    return Result.ok(document)
  }

  async getDocumentByUuid({
    commitUuid,
    documentUuid,
  }: {
    commitUuid?: string
    documentUuid: string
  }) {
    const conditions = [eq(this.scope.documentUuid, documentUuid)]

    let document
    if (commitUuid) {
      conditions.push(eq(commits.uuid, commitUuid))

      document = await this.db
        .select(this.scope._.selectedFields)
        .from(this.scope)
        .innerJoin(commits, eq(this.scope.commitId, commits.id))
        .where(and(...conditions))
        .limit(1)
        .then((docs) => docs[0])
    } else {
      document = await this.db
        .select()
        .from(this.scope)
        .where(and(...conditions, isNotNull(this.scope.mergedAt)))
        .orderBy(desc(this.scope.mergedAt))
        .limit(1)
        .then((docs) => docs[0])
    }

    if (!document)
      return Result.error(
        new NotFoundError(
          `Document not found for commit ${commitUuid} and uuid ${documentUuid}`,
        ),
      )

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
  async getDocumentsAtCommit(commit?: Commit) {
    const result = await this.getAllDocumentsAtCommit({ commit })
    if (result.error) return result

    if (this.opts.includeDeleted) return result
    return Result.ok(result.value.filter((d) => d.deletedAt === null))
  }

  async getDocumentAtCommit({
    projectId,
    commitUuid,
    documentUuid,
  }: GetDocumentAtCommitProps) {
    const commitsScope = new CommitsRepository(this.workspaceId, this.db)
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
    const document = documents.find(
      (d: DocumentVersion) => d.documentUuid === documentUuid,
    )
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

  private async getAllDocumentsAtCommit({ commit }: { commit?: Commit }) {
    if (!commit) return Result.ok([])

    const documentsFromMergedCommits = await this.getDocumentsFromMergedCommits(
      {
        projectId: commit.projectId,
        maxMergedAt: commit.mergedAt,
      },
    ).then((r) => r.unwrap())
    if (commit.mergedAt !== null) {
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

    const filterByProject = () =>
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
          .where(and(filterByMaxMergedAt(), filterByProject()))
          .groupBy(this.scope.documentUuid),
      )

    const documentsFromMergedCommits = await this.db
      .with(lastVersionOfEachDocument)
      .select(this.scope._.selectedFields)
      .from(this.scope)
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

  async getDocumentsForImport(projectId: number) {
    const documents = await this.db
      .selectDistinct({
        documentUuid: this.scope.documentUuid,
        path: this.scope.path,
      })
      .from(this.scope)
      .where(
        and(
          eq(this.scope.projectId, projectId),
          notInArray(
            this.scope.documentUuid,
            this.db
              .select({ documentUuid: this.scope.documentUuid })
              .from(this.scope)
              .where(
                and(
                  eq(this.scope.projectId, projectId),
                  isNotNull(this.scope.deletedAt),
                ),
              ),
          ),
        ),
      )

    return Result.ok(documents)
  }
}
