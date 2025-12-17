import { subDays } from 'date-fns'
import { and, count, desc, eq, getTableColumns, gte } from 'drizzle-orm'
import { DOCUMENT_SUGGESTION_EXPIRATION_DAYS } from '../constants'
import { Result } from '../lib/Result'
import { documentSuggestions } from '../schema/models/documentSuggestions'
import { type Commit } from '../schema/models/types/Commit'
import {
  DocumentSuggestionWithDetails,
  type DocumentSuggestion,
} from '../schema/models/types/DocumentSuggestion'
import { type DocumentVersion } from '../schema/models/types/DocumentVersion'
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
  }: {
    commitId: number
    documentUuid: string
    evaluationUuid?: string
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
    const evaluations = await evaluationsV2Repository
      .listAtCommitByDocument({
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })
      .then((r) => r.unwrap())

    const suggestionsWithDetails = []
    for (const suggestion of suggestions) {
      const evaluation = evaluations.find(
        (e) => e.uuid === suggestion.evaluationUuid,
      )
      if (!evaluation) continue

      suggestionsWithDetails.push({ ...suggestion, evaluation })
    }

    return Result.ok<DocumentSuggestionWithDetails[]>(suggestionsWithDetails)
  }
}
