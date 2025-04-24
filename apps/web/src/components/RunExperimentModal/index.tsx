'use client'

import { useExperiments } from '$/stores/experiments'
import {
  Commit,
  DocumentVersion,
  EvaluationV2,
  ExperimentDto,
  Project,
} from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'
import { useCallback } from 'react'
import { useExperimentFormPayload } from './ExperimentForm/useExperimentFormPayload'
import DatasetForm from './ExperimentForm'

export function RunExperimentModal({
  project,
  commit,
  document,
  isOpen,
  setOpen,
  initialEvaluation,
  onCreate: onCreateCb,
}: {
  project: Project
  commit: Commit
  document: DocumentVersion
  isOpen: boolean
  setOpen: (open: boolean) => void
  initialEvaluation?: EvaluationV2
  onCreate?: (experiment: ExperimentDto) => void
}) {
  const { create, isCreating } = useExperiments(
    {
      projectId: project.id,
      documentUuid: document.documentUuid,
    },
    {
      onCreate: (experiment) => {
        setOpen(false)
        onCreateCb?.(experiment)
      },
    },
  )
  const formPayload = useExperimentFormPayload({
    project,
    commit,
    document,
    initialEvaluation,
  })

  const createExperiment = useCallback(() => {
    if (!formPayload.selectedDataset) {
      return
    }
    create({
      projectId: project.id,
      commitUuid: commit.uuid,
      documentUuid: document.documentUuid,
      name: formPayload.name,
      datasetId: formPayload.selectedDataset.id,
      parametersMap: formPayload.parametersMap,
      datasetLabels: formPayload.datasetLabels,
      fromRow: formPayload.fromLine ?? 1,
      toRow: formPayload.toLine,
      evaluationUuids: formPayload.selectedEvaluations.map((ev) => ev.uuid),
    })
  }, [formPayload])

  return (
    <Modal
      open={isOpen}
      onOpenChange={setOpen}
      size='large'
      title='Run New Experiment'
      description='Create and evaluate a batch of logs for this document based on a selected dataset.'
      footer={
        <>
          <CloseTrigger />
          <Button
            disabled={!document || isCreating || !formPayload.selectedDataset}
            fancy
            onClick={createExperiment}
          >
            Run Experiment
          </Button>
        </>
      }
    >
      <div className='w-full max-w-full relative'>
        <DatasetForm {...formPayload} />
      </div>
    </Modal>
  )
}
