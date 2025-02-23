import { Commit, DocumentVersion, Evaluation } from '../../browser'
import { database } from '../../client'
import { documentSuggestions } from '../../schema'

export async function createDocumentSuggestion({
  prompt = 'prompt',
  summary = 'summary',
  commit,
  document,
  evaluation,
  createdAt,
}: {
  prompt?: string
  summary?: string
  commit: Commit
  document: DocumentVersion
  evaluation: Evaluation
  createdAt?: Date
}) {
  const result = await database
    .insert(documentSuggestions)
    .values({
      commitId: commit.id,
      documentUuid: document.documentUuid,
      evaluationId: evaluation.id,
      prompt: prompt,
      summary: summary,
      ...(createdAt && { createdAt }),
    })
    .returning()

  return result[0]!
}
