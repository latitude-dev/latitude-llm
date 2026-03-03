import {
  and,
  desc,
  eq,
  getTableColumns,
  isNotNull,
  isNull,
  lte,
  sql,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { database } from '../../client'
import { cache } from '../../cache'
import {
  databaseErrorCodes,
  NotFoundError,
  UnprocessableEntityError,
} from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import { commits } from '../../schema/models/commits'
import { documentVersions } from '../../schema/models/documentVersions'
import { projects } from '../../schema/models/projects'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { CommitsRepository } from '../commitsRepository'
import Repository from '../repositoryV2'

const DATE_FIELDS = [
  'createdAt',
  'updatedAt',
  'deletedAt',
  'mergedAt',
] as const

function hydrateDocumentDto(raw: Record<string, unknown>): DocumentVersionDto {
  const hydrated = { ...raw }
  for (const field of DATE_FIELDS) {
    const value = hydrated[field]
    if (typeof value === 'string') {
      hydrated[field] = new Date(value)
    }
  }
  return hydrated as unknown as DocumentVersionDto
}

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

type DocumentVersionDto = DocumentVersion & {
  mergedAt: Date | null
  projectId: number
}

const tt = {
  ...getTableColumns(documentVersions),
  mergedAt: commits.mergedAt,
  projectId: sql<number>`${projects.id}::int`.as('projectId'),
}

export class DocumentVersionsRepository extends Repository<DocumentVersionDto> {
  private opts: DocumentVersionsRepositoryOptions

  constructor(
    workspaceId: number,
    db = database,
    opts: DocumentVersionsRepositoryOptions = {},
  ) {
    super(workspaceId, db)
    this.opts = opts
  }

  get scopeFilter() {
    if (this.opts.includeDeleted) {
      return eq(projects.workspaceId, this.workspaceId)
    }

    return and(
      eq(projects.workspaceId, this.workspaceId),
      isNull(commits.deletedAt),
    )
  }

  get scope() {
    return this.db
      .select(tt)
      .from(documentVersions)
      .innerJoin(commits, eq(commits.id, documentVersions.commitId))
      .innerJoin(projects, eq(projects.id, commits.projectId))
      .where(this.scopeFilter)
      .$dynamic()
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
    // Default to waiting for locks to handle concurrent job processing.
    // Set wait: false explicitly if NOWAIT behavior is needed.
    const shouldWait = wait !== false

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
         ) LIMIT 1 FOR NO KEY UPDATE ${sql.raw(!shouldWait ? 'NOWAIT' : '')};
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

    const result = await this.scope
      .where(
        and(this.scopeFilter, eq(documentVersions.documentUuid, documentUuid)),
      )
      .limit(1)

    return result.length > 0
  }

  async getDocumentById(documentId: number) {
    const res = await this.scope.where(
      and(this.scopeFilter, eq(documentVersions.id, documentId)),
    )

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
    const result = await this.scope.where(
      and(
        this.scopeFilter,
        eq(documentVersions.commitId, commitId),
        eq(documentVersions.documentUuid, documentUuid),
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
    const result = await this.scope
      .where(
        and(
          this.scopeFilter,
          eq(commits.projectId, projectId),
          eq(documentVersions.documentUuid, documentUuid),
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
    const conditions = [eq(documentVersions.documentUuid, documentUuid)]

    let document: DocumentVersionDto | undefined
    if (commitUuid) {
      conditions.push(eq(commits.uuid, commitUuid))

      document = await this.scope
        .where(and(this.scopeFilter, ...conditions))
        .limit(1)
        .then((docs) => docs[0])
    } else {
      document = await this.scope
        .where(
          and(this.scopeFilter, ...conditions, isNotNull(commits.mergedAt)),
        )
        .orderBy(desc(commits.mergedAt))
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
      if (commit.mergedAt !== null) {
        const document = await this.getLatestMergedDocumentByPath({
          projectId: commit.projectId,
          maxMergedAt: commit.mergedAt,
          path,
        })

        if (!document || (!this.opts.includeDeleted && document.deletedAt !== null)) {
          return Result.error(
            new NotFoundError(
              `No document with path ${path} at commit ${commit.uuid}`,
            ),
          )
        }

        return Result.ok(document)
      }

      // Draft commit: check the draft first
      const [draftDoc] = await this.scope
        .where(
          and(
            this.scopeFilter,
            eq(documentVersions.commitId, commit.id),
            eq(documentVersions.path, path),
          ),
        )
        .limit(1)

      if (draftDoc) {
        if (!this.opts.includeDeleted && draftDoc.deletedAt !== null) {
          return Result.error(
            new NotFoundError(
              `No document with path ${path} at commit ${commit.uuid}`,
            ),
          )
        }

        return Result.ok(draftDoc)
      }

      // Not in draft at this path — check merged commits
      const mergedDoc = await this.getLatestMergedDocumentByPath({
        projectId: commit.projectId,
        maxMergedAt: null,
        path,
      })

      if (!mergedDoc) {
        return Result.error(
          new NotFoundError(
            `No document with path ${path} at commit ${commit.uuid}`,
          ),
        )
      }

      // Ensure the draft hasn't overridden this document (e.g. renamed or deleted it)
      const [draftOverride] = await this.scope
        .where(
          and(
            this.scopeFilter,
            eq(documentVersions.commitId, commit.id),
            eq(documentVersions.documentUuid, mergedDoc.documentUuid),
          ),
        )
        .limit(1)

      if (draftOverride) {
        return Result.error(
          new NotFoundError(
            `No document with path ${path} at commit ${commit.uuid}`,
          ),
        )
      }

      if (!this.opts.includeDeleted && mergedDoc.deletedAt !== null) {
        return Result.error(
          new NotFoundError(
            `No document with path ${path} at commit ${commit.uuid}`,
          ),
        )
      }

      return Result.ok(mergedDoc)
    } catch (err) {
      return Result.error(err as Error)
    }
  }

  /**
   * Returns the latest merged version of a document at the given path, using a
   * subquery so the path filter runs after the DISTINCT ON — avoiding the need
   * to fetch all documents and filter in application memory.
   */
  private async getLatestMergedDocumentByPath({
    projectId,
    maxMergedAt,
    path,
  }: {
    projectId: number
    maxMergedAt: Date | null
    path: string
  }): Promise<DocumentVersionDto | undefined> {
    const mergedAtFilter = maxMergedAt
      ? and(isNotNull(commits.mergedAt), lte(commits.mergedAt, maxMergedAt))
      : isNotNull(commits.mergedAt)

    const latestVersions = this.db
      .selectDistinctOn([documentVersions.documentUuid], tt)
      .from(documentVersions)
      .innerJoin(commits, eq(commits.id, documentVersions.commitId))
      .innerJoin(projects, eq(projects.id, commits.projectId))
      .where(
        and(this.scopeFilter, mergedAtFilter, eq(commits.projectId, projectId)),
      )
      .orderBy(desc(documentVersions.documentUuid), desc(commits.mergedAt))
      .as('latest_versions')

    const [document] = await this.db
      .select()
      .from(latestVersions)
      .where(eq(latestVersions.path, path))
      .limit(1)

    return document
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

  async listDocumentsAtCommit(params: {
    projectId?: number
    commitUuid: string
  }): Promise<TypedResult<DocumentVersionDto[]>>
  async listDocumentsAtCommit(params: {
    commitId: number
  }): Promise<TypedResult<DocumentVersionDto[]>>
  async listDocumentsAtCommit({
    projectId,
    commitId,
    commitUuid,
  }: {
    projectId?: number
    commitId?: number
    commitUuid?: string
  }) {
    const commitsScope = new CommitsRepository(this.workspaceId, this.db)

    let commit: Commit
    if (commitId) {
      const commitResult = await commitsScope.getCommitById(commitId)
      if (commitResult.error) return commitResult
      commit = commitResult.unwrap()
    } else {
      const commitResult = await commitsScope.getCommitByUuid({
        projectId,
        uuid: commitUuid!,
      })
      if (commitResult.error) return commitResult
      commit = commitResult.unwrap()
    }

    const documentsResult = await this.getDocumentsAtCommit(commit)
    if (documentsResult.error) return documentsResult
    const documents = documentsResult.unwrap()

    return Result.ok(documents)
  }

  async getDocumentAtCommit(params: {
    projectId?: number
    commitUuid: string
    documentUuid: string
  }): Promise<TypedResult<DocumentVersionDto>>
  async getDocumentAtCommit(params: {
    commitId: number
    documentUuid: string
  }): Promise<TypedResult<DocumentVersionDto>>
  async getDocumentAtCommit({
    projectId,
    commitId,
    commitUuid,
    documentUuid,
  }: {
    projectId?: number
    commitId?: number
    commitUuid?: string
    documentUuid: string
  }) {
    const commitsScope = new CommitsRepository(this.workspaceId, this.db)

    let commit: Commit
    if (commitId) {
      const commitResult = await commitsScope.getCommitById(commitId)
      if (commitResult.error) return commitResult
      commit = commitResult.unwrap()
    } else {
      const commitResult = await commitsScope.getCommitByUuid({
        projectId,
        uuid: commitUuid!,
      })
      if (commitResult.error) return commitResult
      commit = commitResult.unwrap()
    }

    const documentInCommit = await this.scope
      .where(
        and(
          this.scopeFilter,
          eq(documentVersions.commitId, commit.id),
          eq(documentVersions.documentUuid, documentUuid),
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
    const changedDocuments = await this.scope.where(
      and(this.scopeFilter, eq(documentVersions.commitId, commit.id)),
    )

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

    const documentsFromDraft = await this.scope.where(
      and(this.scopeFilter, eq(documentVersions.commitId, commit.id)),
    )

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
      const mergedAtNotNull = isNotNull(commits.mergedAt)
      if (!maxMergedAt) return mergedAtNotNull

      return and(mergedAtNotNull, lte(commits.mergedAt, maxMergedAt))
    }

    const filterByProject = () =>
      projectId ? eq(commits.projectId, projectId) : undefined

    const query = () =>
      this.db
        .selectDistinctOn([documentVersions.documentUuid], tt)
        .from(documentVersions)
        .innerJoin(commits, eq(commits.id, documentVersions.commitId))
        .innerJoin(projects, eq(projects.id, commits.projectId))
        .where(and(this.scopeFilter, filterByMaxMergedAt(), filterByProject()))
        .orderBy(desc(documentVersions.documentUuid), desc(commits.mergedAt))

    // Merged-commit snapshots are immutable: safe to cache indefinitely.
    // Skip caching when maxMergedAt is absent (draft commits — the set of
    // merged documents grows as new commits land).
    if (!maxMergedAt) return Result.ok(await query())

    const cacheKey = `workspace:${this.workspaceId}:project:${projectId}:merged-docs:${maxMergedAt.toISOString()}`

    try {
      const cacheClient = await cache()
      const cached = await cacheClient.get(cacheKey)
      if (cached !== null && cached !== undefined) {
        const parsed = JSON.parse(cached) as Record<string, unknown>[]
        return Result.ok(parsed.map(hydrateDocumentDto))
      }
    } catch (_error) {
      // Ignore cache read errors
    }

    const documents = await query()

    try {
      const cacheClient = await cache()
      // 24-hour TTL as a conservative upper bound; the data is actually
      // immutable for a given maxMergedAt so no invalidation is needed.
      await cacheClient.set(cacheKey, JSON.stringify(documents), 'EX', 86400)
    } catch (_error) {
      // Ignore cache write errors
    }

    return Result.ok(documents)
  }

  async getDocumentsForImport(projectId: number) {
    const deletedDocumentVersions = alias(
      documentVersions,
      'deletedDocumentVersions',
    )
    const deletedCommits = alias(commits, 'deletedCommits')

    const documents = await this.db
      .selectDistinct({
        documentUuid: documentVersions.documentUuid,
        path: documentVersions.path,
      })
      .from(documentVersions)
      .innerJoin(commits, eq(commits.id, documentVersions.commitId))
      .innerJoin(projects, eq(projects.id, commits.projectId))
      .leftJoin(
        deletedDocumentVersions,
        and(
          eq(
            deletedDocumentVersions.documentUuid,
            documentVersions.documentUuid,
          ),
          isNotNull(deletedDocumentVersions.deletedAt),
        ),
      )
      .leftJoin(
        deletedCommits,
        and(
          eq(deletedCommits.id, deletedDocumentVersions.commitId),
          eq(deletedCommits.projectId, projectId),
          this.opts.includeDeleted
            ? undefined
            : isNull(deletedCommits.deletedAt),
        ),
      )
      .where(
        and(
          this.scopeFilter,
          eq(commits.projectId, projectId),
          isNull(deletedCommits.id),
        ),
      )

    return Result.ok(documents)
  }
}
