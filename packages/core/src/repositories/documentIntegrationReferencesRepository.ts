import {
  and,
  eq,
  getTableColumns,
  isNotNull,
  isNull,
  lte,
  max,
  sql,
} from 'drizzle-orm'

import { Commit, DocumentIntegrationReference } from '../browser'
import {
  documentIntegrationReferences,
  documentVersions,
  commits,
  projects,
} from '../schema'
import Repository from './repositoryV2'
import { Result } from '../lib/Result'
import { PromisedResult } from '../lib/Transaction'
import { LatitudeError } from '@latitude-data/constants/errors'

const tt = getTableColumns(documentIntegrationReferences)

// Document versions scope with joins (cloned from DocumentVersionsRepository)
const documentVersionsTt = {
  ...getTableColumns(documentVersions),
  mergedAt: commits.mergedAt,
  projectId: sql<number>`${projects.id}::int`.as('projectId'),
}

function mergeReferences(
  ...referencesArr: DocumentIntegrationReference[][]
): DocumentIntegrationReference[] {
  return referencesArr.reduce((acc, references) => {
    return acc
      .filter((r) => {
        return !references.find(
          (r2) =>
            r2.documentUuid === r.documentUuid && r2.commitId === r.commitId,
        )
      })
      .concat(references)
  }, [])
}

export class DocumentIntegrationReferencesRepository extends Repository<DocumentIntegrationReference> {
  get scopeFilter() {
    return eq(documentIntegrationReferences.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(documentIntegrationReferences)
      .where(this.scopeFilter)
      .$dynamic()
  }

  // Document versions scope (cloned from DocumentVersionsRepository)
  get documentVersionsScope() {
    return this.db
      .select(documentVersionsTt)
      .from(documentVersions)
      .innerJoin(
        commits,
        and(
          eq(commits.id, documentVersions.commitId),
          isNull(commits.deletedAt),
        ),
      )
      .innerJoin(projects, eq(projects.id, commits.projectId))
      .where(eq(projects.workspaceId, this.workspaceId))
      .as('documentVersionsScope')
  }

  async getAllActive(): PromisedResult<
    DocumentIntegrationReference[],
    LatitudeError
  > {
    const referencesFromMergedCommitsResult =
      await this.getReferencesFromMergedCommits()

    if (!Result.isOk(referencesFromMergedCommitsResult)) {
      return referencesFromMergedCommitsResult
    }
    const referencesFromMergedCommits =
      referencesFromMergedCommitsResult.unwrap()

    const referencesFromDrafts = await this.db
      .select(tt)
      .from(documentIntegrationReferences)
      .innerJoin(
        commits,
        eq(commits.id, documentIntegrationReferences.commitId),
      )
      .where(
        and(
          isNull(commits.mergedAt),
          eq(documentIntegrationReferences.workspaceId, this.workspaceId),
        ),
      )

    return Result.ok([...referencesFromMergedCommits, ...referencesFromDrafts])
  }

  async getActiveInCommit(
    commit: Commit,
  ): PromisedResult<DocumentIntegrationReference[], LatitudeError> {
    if (!commit) return Result.ok([])

    const referencesFromMergedCommitsResult =
      await this.getReferencesFromMergedCommits({
        projectId: commit.projectId,
      })
    if (!Result.isOk(referencesFromMergedCommitsResult)) {
      return referencesFromMergedCommitsResult
    }
    const referencesFromMergedCommits =
      referencesFromMergedCommitsResult.unwrap()

    if (commit.mergedAt !== null) {
      // Referenced commit is merged. No additional references to return.
      return Result.ok(referencesFromMergedCommits)
    }

    const referencesFromDraft = await this.db
      .select(tt)
      .from(documentIntegrationReferences)
      .innerJoin(
        this.documentVersionsScope,
        and(
          eq(
            this.documentVersionsScope.documentUuid,
            documentIntegrationReferences.documentUuid,
          ),
          eq(
            this.documentVersionsScope.commitId,
            documentIntegrationReferences.commitId,
          ),
        ),
      )
      .where(
        and(
          eq(documentIntegrationReferences.workspaceId, this.workspaceId),
          eq(this.documentVersionsScope.commitId, commit.id),
        ),
      )

    const totalReferences = mergeReferences(
      referencesFromMergedCommits,
      referencesFromDraft as DocumentIntegrationReference[],
    )

    return Result.ok(totalReferences)
  }

  // Clone of getDocumentsFromMergedCommits but with RIGHT JOIN to integration references
  private async getReferencesFromMergedCommits({
    projectId,
    maxMergedAt,
  }: {
    projectId?: number
    maxMergedAt?: Date | null
  } = {}) {
    const filterByMaxMergedAt = () => {
      const mergedAtNotNull = isNotNull(this.documentVersionsScope.mergedAt)
      if (!maxMergedAt) return mergedAtNotNull

      return and(
        mergedAtNotNull,
        lte(this.documentVersionsScope.mergedAt, maxMergedAt),
      )
    }

    const filterByProject = () =>
      projectId
        ? eq(this.documentVersionsScope.projectId, projectId)
        : undefined

    const lastVersionOfEachDocument = this.db
      .$with('lastVersionOfDocuments')
      .as(
        this.db
          .select({
            documentUuid: this.documentVersionsScope.documentUuid,
            mergedAt: max(this.documentVersionsScope.mergedAt).as(
              'maxMergedAt',
            ),
          })
          .from(this.documentVersionsScope)
          .where(and(filterByMaxMergedAt(), filterByProject()))
          .groupBy(this.documentVersionsScope.documentUuid),
      )

    const referencesFromMergedCommits = await this.db
      .with(lastVersionOfEachDocument)
      .select(tt)
      .from(documentIntegrationReferences)
      .innerJoin(
        this.documentVersionsScope,
        and(
          eq(
            this.documentVersionsScope.documentUuid,
            documentIntegrationReferences.documentUuid,
          ),
          eq(
            this.documentVersionsScope.commitId,
            documentIntegrationReferences.commitId,
          ),
        ),
      )
      .innerJoin(
        lastVersionOfEachDocument,
        and(
          eq(
            this.documentVersionsScope.documentUuid,
            lastVersionOfEachDocument.documentUuid,
          ),
          eq(
            this.documentVersionsScope.mergedAt,
            lastVersionOfEachDocument.mergedAt,
          ),
        ),
      )
      .where(
        and(
          eq(documentIntegrationReferences.workspaceId, this.workspaceId),
          isNotNull(this.documentVersionsScope.mergedAt),
        ),
      )

    return Result.ok(
      referencesFromMergedCommits as DocumentIntegrationReference[],
    )
  }
}
