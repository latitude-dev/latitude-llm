import { subDays } from 'date-fns'
import { and, count, desc, eq, getTableColumns, gte, isNull } from 'drizzle-orm'
import {
  DOCUMENT_SUGGESTION_EXPIRATION_DAYS,
  DocumentSuggestion,
  DocumentSuggestionWithDetails,
} from '../browser'
import { Result } from '../lib'
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

  get expirationFilter() {
    return gte(
      documentSuggestions.createdAt,
      subDays(new Date(), DOCUMENT_SUGGESTION_EXPIRATION_DAYS),
    )
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
          this.expirationFilter,
        ),
      )

    return Result.ok<number>(result[0]!.count)
  }

  async listByDocumentVersionWithDetails({
    commitId,
    documentUuid,
  }: {
    commitId: number
    documentUuid: string
  }) {
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
          eq(documentSuggestions.commitId, commitId),
          eq(documentSuggestions.documentUuid, documentUuid),
          isNull(evaluations.deletedAt),
          this.expirationFilter,
        ),
      )
      .orderBy(desc(documentSuggestions.createdAt))

    return Result.ok<DocumentSuggestionWithDetails[]>(result)
  }
}
