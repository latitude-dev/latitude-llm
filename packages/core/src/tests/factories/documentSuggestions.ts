import { DocumentVersion, Evaluation } from '../../browser'
import { database } from '../../client'
import { documentSuggestions } from '../../schema'

export async function createDocumentSuggestion({
  document,
  evaluation,
  prompt = 'prompt',
  summary = 'summary',
  createdAt,
}: {
  document: DocumentVersion
  evaluation: Evaluation
  prompt?: string
  summary?: string
  createdAt?: Date
}) {
  const result = await database
    .insert(documentSuggestions)
    .values({
      commitId: document.commitId,
      documentUuid: document.documentUuid,
      evaluationId: evaluation.id,
      prompt: prompt,
      summary: summary,
      ...(createdAt && { createdAt }),
    })
    .returning()

  return result[0]!
}
