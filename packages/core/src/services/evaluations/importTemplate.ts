import { Workspace } from '../../browser'
import { database } from '../../client'
import { findEvaluationTemplateById } from '../../data-access'
import { Result, Transaction } from '../../lib'
import { evaluations } from '../../schema'

type Props = {
  workspace: Partial<Workspace>
  templateId: number
}
export async function importEvaluationTemplate(
  { workspace, templateId }: Props,
  db = database,
) {
  const templateResult = await findEvaluationTemplateById(templateId)
  if (!templateResult.ok) return templateResult

  return Transaction.call(async (tx) => {
    const template = templateResult.unwrap()

    const result = await tx
      .insert(evaluations)
      .values({
        workspaceId: workspace.id!,
        name: template.name,
        description: template.description,
        prompt: template.prompt,
      })
      .returning()

    return Result.ok(result[0]!)
  }, db)
}
