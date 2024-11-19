import { useCallback, useEffect } from 'react'

import { DocumentVersion, EvaluationDto } from '@latitude-data/core/browser'
import { Button, CloseTrigger, Modal } from '@latitude-data/web-ui'
import { useMetadata } from '$/hooks/useMetadata'

import DatasetForm from './DatasetForm'
import { useRunBatch } from './useRunBatch'
import { useRunBatchForm } from './useRunBatchForm'

export default function CreateBatchEvaluationModal({
  open,
  onClose,
  document,
  evaluation,
  projectId,
  commitUuid,
}: {
  open: boolean
  onClose: () => void
  projectId: string
  commitUuid: string
  document: DocumentVersion
  evaluation: EvaluationDto
}) {
  const { runBatch, errors, isRunningBatch } = useRunBatch({
    document,
    projectId,
    commitUuid,
    onSuccess: () => {
      onClose()
    },
  })
  const { metadata, runReadMetadata } = useMetadata()
  useEffect(() => {
    runReadMetadata({
      prompt: document.content ?? '',
      fullPath: document.path,
    })
  }, [])

  const form = useRunBatchForm({ document, documentMetadata: metadata })
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
      open={open}
      onOpenChange={onClose}
      size='large'
      title='Select the dataset that contain the data to generate the logs'
      description='Select the dataset you want to analyze and map the parameters of selected evaluations with dataset columns.'
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
        document={document}
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
        parameters={form.parameters}
      />
    </Modal>
  )
}
