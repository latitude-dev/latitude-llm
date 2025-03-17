import { useCallback, useEffect } from 'react'

import { DocumentVersion, EvaluationTmp } from '@latitude-data/core/browser'
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

  const { metadata, runReadMetadata } = useMetadata()
  useEffect(() => {
    runReadMetadata({
      prompt: document.content ?? '',
      fullPath: document.path,
      promptlVersion: document.promptlVersion,
    })
  }, [document])
  const form = useRunBatchForm({ document, documentMetadata: metadata })
  const onRunBatch = useCallback(async () => {
    if (!form.selectedDataset) return
    await runBatch({
      datasetId: form.selectedDataset.id,
      datasetVersion: form.datasetVersion,
      datasetLabel: form.datasetLabel,
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
        document={document}
        evaluation={evaluation}
        errors={errors}
        datasets={form.datasets}
        isLoadingDatasets={form.isLoadingDatasets}
        selectedDataset={form.selectedDataset}
        onSelectDataset={form.onSelectDataset}
        onToggleAllLines={form.onToggleAllLines}
        wantAllLines={form.wantAllLines}
        fromLine={form.fromLine}
        toLine={form.toLine}
        datasetLabel={form.datasetLabel}
        onChangeFromLine={form.setFromLine}
        onChangeToLine={form.setToLine}
        onChangeDatasetLabel={form.setDatasetLabel}
        headers={form.headers}
        labels={form.labels}
        parametersList={form.parametersList}
        onParametersChange={form.onParameterChange}
        parameters={form.parameters}
        maxLineCount={form.maxLineCount}
      />
    </Modal>
  )
}
