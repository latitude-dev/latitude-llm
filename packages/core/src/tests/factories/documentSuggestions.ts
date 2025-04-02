import {
  Commit,
  DocumentVersion,
  EvaluationTmp,
  Workspace,
} from '../../browser'
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
  commit: Commit
  document: DocumentVersion
  evaluation: EvaluationTmp
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
      evaluationUuid: evaluation.version === 'v2' ? evaluation.uuid : undefined,
      evaluationId: evaluation.version !== 'v2' ? evaluation.id : undefined,
      oldPrompt: document.content,
      newPrompt: prompt,
      summary: summary,
      ...(createdAt && { createdAt }),
    })
    .returning()

  return result[0]!
}
