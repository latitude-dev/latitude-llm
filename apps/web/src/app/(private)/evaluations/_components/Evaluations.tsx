'use client'

import { useState } from 'react'

import { EvaluationTemplateWithCategory } from '@latitude-data/core/browser'
import { Container } from '@latitude-data/web-ui'

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
    <Container>
      <ActiveEvaluations
        onCreateEvaluation={() =>
          setNewEvaluationData({
            title: 'New Evaluation',
            description: '',
            prompt: '',
          })
        }
      />
      {evaluationTemplates.length > 0 && (
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
      )}
      <CreateEvaluationModal
        data={newEvaluationData}
        onClose={() => setNewEvaluationData(undefined)}
      />
    </Container>
  )
}
