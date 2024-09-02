import { SafeWorkspace, Workspace } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { EvaluationsRepository } from '../../repositories'
import { evaluations } from '../../schema'

type Props = {
  workspace: Workspace | SafeWorkspace
  name: string
  description: string
  prompt: string
}
export async function createEvaluation(
  { workspace, name, description, prompt }: Props,
  db = database,
) {
  const evaluationsScope = new EvaluationsRepository(workspace.id, db)
  const existsEvaluation = await evaluationsScope.findByName(name)
  if (existsEvaluation.ok) {
    return Result.error(
      new Error(
        'An evaluation with the same name already exists in this workspace',
      ),
    )
  }

  return await Transaction.call(async (tx) => {
    const result = await tx
      .insert(evaluations)
      .values({
        workspaceId: workspace.id,
        name,
        description,
        prompt,
        templateId: null,
      })
      .returning()

    return Result.ok(result[0]!)
  }, db)
}
