import { Workspace } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { evaluations } from '../../schema'

type Props = {
  workspace: Workspace
  name: string
  description: string
  prompt: string
}
export function createEvaluation(
  { workspace, name, description, prompt }: Props,
  db = database,
) {
  return Transaction.call(async (tx) => {
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
