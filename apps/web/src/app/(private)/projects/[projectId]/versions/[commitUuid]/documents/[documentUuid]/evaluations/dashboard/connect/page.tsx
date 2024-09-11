'use client'

import { useState } from 'react'

import { Button, CloseTrigger, Modal, Steps } from '@latitude-data/web-ui'
import { connectEvaluationsAction } from '$/actions/evaluations/connect'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useEvaluations from '$/stores/evaluations'
import useEvaluationTemplates from '$/stores/evaluationTemplates'

import ConnectEvaluationStep from './_components/ConnectToEvaluationStep'
import MapPromptDataToDatasetStep from './_components/MapPromptDataToDatasetStep'

function title(step: number) {
  switch (step) {
    case 1:
      return 'Which evaluations do you want to connect?'
    case 2:
      return 'What data do you want to analyze?'
  }
}

function description(step: number) {
  switch (step) {
    case 1:
      return 'Batch evaluations allow you to analyze a specific amount of logs generated from a dataset.'
    // TODO: Probably description in step 2 is different from step 1
    case 2:
      return 'Batch evaluations allow you to analyze a specific amount of logs generated from a dataset.'
  }
}

export default function ConnectionEvaluationModal({
  params: { projectId, commitUuid, documentUuid },
}: {
  params: {
    projectId: string
    commitUuid: string
    documentUuid: string
  }
}) {
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [step, setStep] = useState(1)
  const { execute, isPending: isCreatingConnections } = useLatitudeAction(
    connectEvaluationsAction,
  )
  const navigate = useNavigate()
  const { data: templates } = useEvaluationTemplates()
  const { data: evaluations, mutate } = useEvaluations()
  const createConnections = async () => {
    const templateIds = selectedItems
      .filter((id) =>
        templates?.some((template) => template.id.toString() === id),
      )
      .map(Number)
    const evaluationUuids = selectedItems.filter((id) =>
      evaluations?.some((evaluation) => evaluation.uuid === id),
    )

    const [data] = await execute({
      projectId,
      templateIds,
      evaluationUuids,
      documentUuid,
    })

    if (data) {
      mutate()
      setStep(2)
    }
  }

  return (
    <Modal
      open
      size='large'
      title={title(step)}
      description={description(step)}
      onOpenChange={() => {
        navigate.push(
          ROUTES.projects
            .detail({ id: Number(projectId) })
            .commits.detail({ uuid: commitUuid })
            .documents.detail({ uuid: documentUuid }).evaluations.root,
        )
      }}
      steps={{ total: 2, current: step }}
      footer={
        <>
          <CloseTrigger />
          {step === 1 && (
            <Button
              fancy
              disabled={selectedItems.length === 0 || isCreatingConnections}
              onClick={createConnections}
            >
              Connect Evaluations
            </Button>
          )}
          {step === 2 && (
            <Button
              fancy
              onClick={() => {
                // TODO: Implement this
              }}
            >
              Continue to evaluations
            </Button>
          )}
        </>
      }
    >
      <Steps step={step} className='min-w-0 overflow-visible'>
        <ConnectEvaluationStep
          selectedItems={selectedItems}
          setSelectedItems={setSelectedItems}
        />
        <MapPromptDataToDatasetStep />
      </Steps>
    </Modal>
  )
}
