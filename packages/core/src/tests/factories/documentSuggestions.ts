import { Commit, DocumentVersion, Evaluation } from '../../browser'
import { database } from '../../client'
import { documentSuggestions } from '../../schema'

export async function createDocumentSuggestion({
  prompt,
  summary,
  commit,
  document,
  evaluation,
}: {
  prompt: string
  summary: string
  commit: Commit
  document: DocumentVersion
  evaluation: Evaluation
}) {
  const result = await database
    .insert(documentSuggestions)
    .values({
      commitId: commit.id,
      documentUuid: document.documentUuid,
      evaluationId: evaluation.id,
      prompt: prompt,
      summary: summary,
    })
    .returning()
  const suggestion = result[0]!

  return suggestion
}
