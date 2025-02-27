import { subDays } from 'date-fns'
import { and, count, desc, eq, getTableColumns, gte, isNull } from 'drizzle-orm'
import {
  DOCUMENT_SUGGESTION_EXPIRATION_DAYS,
  DocumentSuggestion,
  DocumentSuggestionWithDetails,
} from '../browser'
import { Result } from '../lib'
import { documentSuggestions, evaluations } from '../schema'
import Repository from './repositoryV2'

const tt = getTableColumns(documentSuggestions)

export class DocumentSuggestionsRepository extends Repository<DocumentSuggestion> {
  get scopeFilter() {
    return eq(documentSuggestions.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(documentSuggestions)
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

  async listByDocumentVersion({
    commitId,
    documentUuid,
  }: {
    commitId: number
    documentUuid: string
  }) {
    const result = await this.scope
      .where(
        and(
          this.scopeFilter,
          eq(documentSuggestions.commitId, commitId),
          eq(documentSuggestions.documentUuid, documentUuid),
          this.expirationFilter,
        ),
      )
      .orderBy(desc(documentSuggestions.createdAt))

    return Result.ok<DocumentSuggestion[]>(result)
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
      .innerJoin(
        evaluations,
        eq(evaluations.id, documentSuggestions.evaluationId),
      )
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
