import { Workspace } from '$core/browser'
import { database } from '$core/client'
import { findEvaluationTemplateById } from '$core/data-access'
import { Result, Transaction } from '$core/lib'
import { evaluations } from '$core/schema'

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
