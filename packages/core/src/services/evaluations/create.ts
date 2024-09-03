import { EvaluationMetadataType, SafeWorkspace, Workspace } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { evaluations, llmAsJudgeEvaluationMetadatas } from '../../schema'

type Props = {
  workspace: Workspace | SafeWorkspace
  name: string
  description: string
  type: EvaluationMetadataType
  metadata?: Record<string, unknown>
}

export async function createEvaluation(
  { workspace, name, description, type, metadata = {} }: Props,
  db = database,
) {
  return await Transaction.call(async (tx) => {
    let metadataTable
    switch (type) {
      case EvaluationMetadataType.LlmAsJudge:
        metadataTable = await tx
          .insert(llmAsJudgeEvaluationMetadatas)
          .values(metadata as { prompt: string; templateId: number })
          .returning()

        break
    }

    const result = await tx
      .insert(evaluations)
      .values([
        {
          description,
          metadataId: metadataTable[0]!.id,
          name,
          metadataType: type,
          workspaceId: workspace.id,
        },
      ])
      .returning()

    return Result.ok({ ...result[0]!, metadata: metadataTable[0]! })
  }, db)
}
