import { DocumentVersion, Evaluation, Workspace } from '../../browser'
import { database } from '../../client'
import { documentSuggestions } from '../../schema'

export async function createDocumentSuggestion({
  document,
  evaluation,
  workspace,
  prompt = 'prompt',
  summary = 'summary',
  createdAt,
}: {
  document: DocumentVersion
  evaluation: Evaluation
  workspace: Workspace
  prompt?: string
  summary?: string
  createdAt?: Date
}) {
  const result = await database
    .insert(documentSuggestions)
    .values({
      workspaceId: workspace.id,
      commitId: document.commitId,
      documentUuid: document.documentUuid,
      evaluationId: evaluation.id,
      oldPrompt: document.content,
      newPrompt: prompt,
      summary: summary,
      ...(createdAt && { createdAt }),
    })
    .returning()

  return result[0]!
}
