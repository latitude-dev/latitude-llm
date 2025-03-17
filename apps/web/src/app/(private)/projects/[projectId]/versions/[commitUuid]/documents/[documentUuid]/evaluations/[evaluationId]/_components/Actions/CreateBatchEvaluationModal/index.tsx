import { useCallback } from 'react'

import { DocumentVersion, EvaluationTmp } from '@latitude-data/core/browser'
import { Button, CloseTrigger, Modal } from '@latitude-data/web-ui'

import { ConversationMetadata } from 'promptl-ai'
import DatasetForm from './DatasetForm'
import { useRunBatch } from './useRunBatch'
import { useRunBatchForm } from './useRunBatchForm'

export default function CreateBatchEvaluationModal({
  open,
  onClose,
  document,
  documentMetadata,
  evaluation,
  projectId,
  commitUuid,
}: {
  open: boolean
  onClose: () => void
  projectId: string
  commitUuid: string
  document: DocumentVersion
  documentMetadata: ConversationMetadata | undefined
  evaluation: EvaluationTmp
}) {
  const { runBatch, errors, isRunningBatch } = useRunBatch({
    document,
    projectId,
    commitUuid,
    onSuccess: () => {
      onClose()
    },
  })

  const form = useRunBatchForm({ document, documentMetadata })
  const onRunBatch = useCallback(async () => {
    if (!form.selectedDataset) return
    await runBatch({
      datasetId: form.selectedDataset.id,
      ...(evaluation.version === 'v2'
        ? {
            evaluationUuids: [evaluation.uuid],
          }
        : {
            evaluationIds: [evaluation.id],
          }),
      fromLine: form.fromLine,
      toLine: form.toLine,
      wantAllLines: form.wantAllLines,
      parameters: form.parameters,
      datasetVersion: form.datasetVersion,
    })
  }, [form, evaluation, runBatch])

  return (
    <Modal
      dismissible
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
            {isRunningBatch ? 'Starting...' : 'Run Evaluations'}
          </Button>
        </>
      }
    >
      <DatasetForm
        datasetVersion={form.datasetVersion}
        document={document}
        errors={errors}
        datasets={form.datasets}
        isLoadingDatasets={form.isLoadingDatasets}
        selectedDataset={form.selectedDataset}
        onSelectDataset={form.onSelectDataset}
        onToggleAllLines={form.onToggleAllLines}
        wantAllLines={form.wantAllLines}
        fromLine={form.fromLine}
        toLine={form.toLine}
        onChangeFromLine={form.setFromLine}
        onChangeToLine={form.setToLine}
        headers={form.headers}
        parametersList={form.parametersList}
        onParametersChange={form.onParameterChange}
        parameters={form.parameters}
        maxLineCount={form.maxLineCount}
      />
    </Modal>
  )
}
