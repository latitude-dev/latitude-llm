import { subDays } from 'date-fns'
import { and, count, desc, eq, getTableColumns, gte } from 'drizzle-orm'
import {
  Commit,
  DOCUMENT_SUGGESTION_EXPIRATION_DAYS,
  DocumentSuggestion,
  DocumentSuggestionWithDetails,
  DocumentVersion,
} from '../browser'
import { Result } from '../lib'
import { documentSuggestions } from '../schema'
import { EvaluationsRepository } from './evaluationsRepository'
import { EvaluationsV2Repository } from './evaluationsV2Repository'
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
    evaluationUuid,
    evaluationId,
  }: {
    commitId: number
    documentUuid: string
    evaluationUuid?: string
    evaluationId?: number
  }) {
    const filter = [
      this.scopeFilter,
      eq(documentSuggestions.commitId, commitId),
      eq(documentSuggestions.documentUuid, documentUuid),
      this.expirationFilter,
    ]

    if (evaluationUuid) {
      filter.push(eq(documentSuggestions.evaluationUuid, evaluationUuid))
    }

    if (evaluationId) {
      filter.push(eq(documentSuggestions.evaluationId, evaluationId))
    }

    const result = await this.db
      .select({ count: count() })
      .from(documentSuggestions)
      .where(and(...filter))
      .then((r) => r[0]?.count ?? 0)

    return Result.ok<number>(result)
  }

  async listByDocumentVersion({
    commitId,
    documentUuid,
  }: {
    commitId: number
    documentUuid: string
  }) {
    const result = await this.scope.where(
      and(
        this.scopeFilter,
        eq(documentSuggestions.commitId, commitId),
        eq(documentSuggestions.documentUuid, documentUuid),
        this.expirationFilter,
      ),
    )

    return Result.ok<DocumentSuggestion[]>(result)
  }

  async listByDocumentVersionWithDetails({
    commit,
    document,
  }: {
    commit: Pick<Commit, 'uuid'>
    document: Pick<DocumentVersion, 'commitId' | 'documentUuid'>
  }) {
    const suggestions = await this.listByDocumentVersion({
      commitId: document.commitId,
      documentUuid: document.documentUuid,
    }).then((r) => r.unwrap())

    const evaluationsV2Repository = new EvaluationsV2Repository(
      this.workspaceId,
      this.db,
    )
    const evaluationsV2 = await evaluationsV2Repository
      .listAtCommitByDocument({
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })
      .then((r) => r.unwrap())

    const evaluationIds = [
      ...new Set(
        suggestions.filter((s) => s.evaluationId).map((s) => s.evaluationId!),
      ),
    ]
    const evaluationsRepository = new EvaluationsRepository(
      this.workspaceId,
      this.db,
    )
    const evaluationsV1 =
      evaluationIds.length > 0
        ? await evaluationsRepository
            .filterById(evaluationIds)
            .then((r) => r.unwrap())
        : []

    const suggestionsWithDetails = []
    for (const suggestion of suggestions) {
      let evaluation

      if (suggestion.evaluationUuid) {
        const evaluationV2 = evaluationsV2.find(
          (e) => e.uuid === suggestion.evaluationUuid,
        )
        if (!evaluationV2) continue
        evaluation = { ...evaluationV2, version: 'v2' as const }
      } else {
        const evaluationV1 = evaluationsV1.find(
          (e) => e.id === suggestion.evaluationId,
        )
        if (!evaluationV1) continue
        evaluation = { ...evaluationV1, version: 'v1' as const }
      }

      suggestionsWithDetails.push({ ...suggestion, evaluation })
    }

    return Result.ok<DocumentSuggestionWithDetails[]>(suggestionsWithDetails)
  }
}
