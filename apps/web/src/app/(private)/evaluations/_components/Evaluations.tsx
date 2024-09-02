'use client'

import { useState } from 'react'

import { EvaluationTemplateWithCategory } from '@latitude-data/core/browser'

import ActiveEvaluations from './ActiveEvaluations'
import CreateEvaluationModal, {
  CreateEvaluationData,
} from './CreateEvaluationModal'
import EvaluationTemplates from './TemplateEvaluations'

export default function Evaluations({
  evaluationTemplates,
}: {
  evaluationTemplates: EvaluationTemplateWithCategory[]
}) {
  const [newEvaluationData, setNewEvaluationData] =
    useState<CreateEvaluationData>()

  return (
    <div className='w-full flex flex-col items-center'>
      <div className='w-full max-w-screen-xl py-6 px-4 flex flex-col gap-10'>
        <ActiveEvaluations
          onCreateEvaluation={() =>
            setNewEvaluationData({
              title: 'New Evaluation',
              description: '',
              prompt: '',
            })
          }
        />
        <EvaluationTemplates
          evaluationTemplates={evaluationTemplates}
          onSelectTemplate={(template) =>
            setNewEvaluationData({
              title: template.name,
              description: template.description,
              prompt: template.prompt,
            })
          }
        />
        <CreateEvaluationModal
          data={newEvaluationData}
          onClose={() => setNewEvaluationData(undefined)}
        />
      </div>
    </div>
  )
}
