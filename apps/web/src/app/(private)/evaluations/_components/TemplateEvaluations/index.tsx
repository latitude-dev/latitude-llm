import { EvaluationTemplateWithCategory } from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui'

import { TemplateEvaluationsTable } from './Table'

export default function TemplateEvaluations({
  evaluationTemplates,
  onSelectTemplate,
}: {
  evaluationTemplates: EvaluationTemplateWithCategory[]
  onSelectTemplate: (template: EvaluationTemplateWithCategory) => void
}) {
  return (
    <div className='w-full flex flex-col gap-4'>
      <Text.H4M>Templates</Text.H4M>
      <TemplateEvaluationsTable
        evaluationTemplates={evaluationTemplates}
        onSelectTemplate={onSelectTemplate}
      />
    </div>
  )
}
