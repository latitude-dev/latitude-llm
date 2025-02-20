import { subDays } from 'date-fns'
import { and, count, desc, eq, getTableColumns, gte, isNull } from 'drizzle-orm'
import {
  DOCUMENT_SUGGESTION_EXPIRATION_DAYS,
  DocumentSuggestion,
  DocumentSuggestionWithDetails,
} from '../browser'
import { NotFoundError, Result } from '../lib'
import { commits, documentSuggestions, evaluations, projects } from '../schema'
import Repository from './repositoryV2'

const tt = getTableColumns(documentSuggestions)

export class DocumentSuggestionsRepository extends Repository<DocumentSuggestion> {
  get scopeFilter() {
    return eq(projects.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(documentSuggestions)
      .innerJoin(commits, eq(commits.id, documentSuggestions.commitId)) // Needed for tenancy
      .innerJoin(projects, eq(projects.id, commits.projectId)) // Needed for tenancy
      .where(this.scopeFilter)
      .orderBy(desc(documentSuggestions.createdAt))
      .$dynamic()
  }

  async countByDocumentVersionAndEvaluation({
    commitId,
    documentUuid,
    evaluationId,
  }: {
    commitId: number
    documentUuid: string
    evaluationId: number
  }) {
    const result = await this.db
      .select({ count: count() })
      .from(documentSuggestions)
      .innerJoin(commits, eq(commits.id, documentSuggestions.commitId)) // Needed for tenancy
      .innerJoin(projects, eq(projects.id, commits.projectId)) // Needed for tenancy
      .where(
        and(
          this.scopeFilter,
          eq(documentSuggestions.commitId, commitId),
          eq(documentSuggestions.documentUuid, documentUuid),
          eq(documentSuggestions.evaluationId, evaluationId),
          gte(
            documentSuggestions.createdAt,
            subDays(new Date(), DOCUMENT_SUGGESTION_EXPIRATION_DAYS),
          ),
        ),
      )

    return Result.ok<number>(result[0]!.count)
  }

  async listByDocumentVersionWithDetails({
    commitId,
    commitUuid,
    documentUuid,
  }: {
    commitId?: number
    commitUuid?: string
    documentUuid: string
  }) {
    let commitFilter

    if (commitId) {
      commitFilter = eq(documentSuggestions.commitId, commitId)
    }

    if (commitUuid) {
      commitFilter = eq(commits.uuid, commitUuid)
    }

    if (!commitFilter) {
      return Result.error(
        new NotFoundError('Either commitId or commitUuid must be provided'),
      )
    }

    const result = await this.db
      .select({
        ...tt,
        evaluationUuid: evaluations.uuid,
        evaluationName: evaluations.name,
      })
      .from(documentSuggestions)
      .innerJoin(commits, eq(commits.id, documentSuggestions.commitId))
      .innerJoin(
        evaluations,
        eq(evaluations.id, documentSuggestions.evaluationId),
      )
      .innerJoin(projects, eq(projects.id, commits.projectId)) // Needed for tenancy
      .where(
        and(
          this.scopeFilter,
          commitFilter,
          eq(documentSuggestions.documentUuid, documentUuid),
          isNull(evaluations.deletedAt),
          gte(
            documentSuggestions.createdAt,
            subDays(new Date(), DOCUMENT_SUGGESTION_EXPIRATION_DAYS),
          ),
        ),
      )
      .orderBy(desc(documentSuggestions.createdAt))

    return Result.ok<DocumentSuggestionWithDetails[]>(result)
  }
}
