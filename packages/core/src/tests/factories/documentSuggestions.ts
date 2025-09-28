import {
  Commit,
  DocumentVersion,
  EvaluationV2,
  Workspace,
} from '../../schema/types'
import { database } from '../../client'
import { documentSuggestions } from '../../schema/models/documentSuggestions'

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
