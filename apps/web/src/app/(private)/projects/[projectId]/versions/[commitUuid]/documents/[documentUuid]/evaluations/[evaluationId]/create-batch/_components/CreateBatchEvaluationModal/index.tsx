'use client'

import { useCallback } from 'react'

import { ConversationMetadata } from '@latitude-data/compiler'
import { DocumentVersion, EvaluationDto } from '@latitude-data/core/browser'
import { Button, CloseTrigger, Modal } from '@latitude-data/web-ui'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'

import DatasetForm from './DatasetForm'
import { useRunBatch } from './useRunBatch'
import { useRunBatchForm } from './useRunBatchForm'

export default function CreateBatchEvaluationModal({
  document,
  evaluation,
  documentMetadata,
  projectId,
  commitUuid,
}: {
  projectId: string
  commitUuid: string
  document: DocumentVersion
  evaluation: EvaluationDto
  documentMetadata: ConversationMetadata
}) {
  const navigate = useNavigate()
  const documentUuid = document.documentUuid
  const goToDetail = useCallback(() => {
    navigate.push(
      ROUTES.projects
        .detail({ id: Number(projectId) })
        .commits.detail({ uuid: commitUuid })
        .documents.detail({ uuid: documentUuid })
        .evaluations.detail(evaluation.id).root,
    )
  }, [evaluation.id, projectId, commitUuid, documentUuid])
  const { runBatch, errors, isRunningBatch } = useRunBatch({
    document,
    projectId,
    commitUuid,
    onSuccess: () => {
      goToDetail()
    },
  })
  const form = useRunBatchForm({ documentMetadata })
  const onRunBatch = useCallback(() => {
    runBatch({
      datasetId: form.selectedDataset?.id,
      evaluationIds: [evaluation.id],
      fromLine: form.fromLine,
      toLine: form.toLine,
      wantAllLines: form.wantAllLines,
      parameters: form.parameters,
    })
  }, [
    evaluation.id,
    runBatch,
    form.fromLine,
    form.toLine,
    form.selectedDataset,
    form.parameters,
    form.wantAllLines,
  ])

  return (
    <Modal
      open
      size='large'
      title='Select the dataset that contain the data to generate the logs'
      description='Select the dataset you want to analyze and map the parameters of selected evaluations with dataset columns.'
      onOpenChange={goToDetail}
      footer={
        <>
          <CloseTrigger />
          <Button
            disabled={!form.selectedDataset || isRunningBatch}
            fancy
            onClick={onRunBatch}
          >
            {isRunningBatch ? 'Running...' : 'Run Evaluations'}
          </Button>
        </>
      }
    >
      <DatasetForm
        errors={errors}
        datasets={form.datasets}
        isLoadingDatasets={form.isLoadingDatasets}
        selectedDataset={form.selectedDataset}
        onSelectDataset={form.onSelectDataset}
        onToggleAllLines={form.setAllRows}
        wantAllLines={form.wantAllLines}
        fromLine={form.fromLine}
        toLine={form.toLine}
        onChangeToLine={form.setToLine}
        headers={form.headers}
        parametersList={form.parametersList}
        onParametersChange={form.onParameterChange}
      />
    </Modal>
  )
}
