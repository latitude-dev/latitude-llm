import { database } from '../../client'
import { EvaluationV2 } from '../../constants'
import { documentSuggestions } from '../../schema/models/documentSuggestions'
import { Commit, DocumentVersion, Workspace } from '../../schema/types'

export async function createDocumentSuggestion({
  document,
  evaluation,
  workspace,
  prompt = 'prompt',
  summary = 'summary',
  createdAt,
}: {
  commit: Commit
  document: DocumentVersion
  evaluation: EvaluationV2
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
      evaluationUuid: evaluation.uuid,
      oldPrompt: document.content,
      newPrompt: prompt,
      summary: summary,
      ...(createdAt && { createdAt }),
    })
    .returning()

  return result[0]!
}
