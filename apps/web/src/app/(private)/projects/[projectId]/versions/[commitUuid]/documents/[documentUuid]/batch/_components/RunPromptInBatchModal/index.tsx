'use client'
import { useCallback } from 'react'

import { DatasetVersion, DocumentVersion } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { CloseTrigger } from '@latitude-data/web-ui/atoms/Modal'
import { runDocumentInBatchAction } from '$/actions/documents/runDocumentInBatchAction'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'

import DatasetForm from '../../../evaluations/[evaluationId]/_components/Actions/CreateBatchEvaluationModal/DatasetForm'
import { RunBatchParameters } from '../../../evaluations/[evaluationId]/_components/Actions/CreateBatchEvaluationModal/useRunBatch'
import { useRunDocumentInBatchForm } from './useRunDocumentInBatchForm'

function useRunDocumentInBatch({
  document,
  projectId,
  commitUuid,
  onSuccess,
}: {
  projectId: number
  document: DocumentVersion
  commitUuid: string
  onSuccess: () => void
}) {
  const {
    error,
    execute: run,
    isPending: isRunning,
  } = useLatitudeAction(runDocumentInBatchAction, { onSuccess })
  const errors = error?.fieldErrors
  const runBatch = useCallback(
    async ({
      wantAllLines,
      datasetId,
      datasetVersion,
      parameters,
      fromLine,
      toLine,
    }: {
      datasetId: number | undefined
      datasetVersion: DatasetVersion
      fromLine: number | undefined
      toLine: number | undefined
      wantAllLines: boolean
      parameters: RunBatchParameters
    }) => {
      await run({
        commitUuid,
        datasetId: datasetId!,
        datasetVersion,
        documentUuid: document.documentUuid,
        fromLine: wantAllLines ? undefined : fromLine,
        parameters,
        projectId: Number(projectId),
        toLine: wantAllLines ? undefined : toLine,
      })
    },
    [run, projectId, document.documentUuid, commitUuid],
  )

  return {
    runBatch,
    isRunningBatch: isRunning,
    errors,
  }
}

export default function RunPromptInBatchModal() {
  const navigate = useNavigate()
  const { document } = useCurrentDocument()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { toast } = useToast()

  const form = useRunDocumentInBatchForm({
    document,
    commitVersionUuid: commit.uuid,
  })
  const { runBatch, errors, isRunningBatch } = useRunDocumentInBatch({
    document,
    projectId: project.id,
    commitUuid: commit.uuid,
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Batch run started successfully',
      })

      navigate.push(
        ROUTES.projects
          .detail({ id: project.id })
          .commits.detail({ uuid: commit.uuid })
          .documents.detail({ uuid: document.documentUuid }).logs.root,
      )
    },
  })

  const onRunBatch = () => {
    runBatch({
      datasetId: form.selectedDataset?.id,
      datasetVersion: form.datasetVersion,
      fromLine: form.fromLine,
      toLine: form.toLine,
      wantAllLines: form.wantAllLines,
      parameters: form.parameters,
    })
  }

  return (
    <Modal
      open
      dismissible
      onOpenChange={() => navigate.back()}
      size='large'
      title='Select the dataset that contains the data to generate the logs'
      description='Select the dataset you want to analyze and map the parameters with dataset columns.'
      footer={
        <>
          <CloseTrigger />
          <Button
            disabled={!form.selectedDataset || isRunningBatch}
            fancy
            onClick={onRunBatch}
          >
            {isRunningBatch ? 'Running...' : 'Run Batch'}
          </Button>
        </>
      }
    >
      <DatasetForm
        document={document}
        errors={errors}
        datasets={form.datasets}
        maxLineCount={form.maxLineCount}
        isLoadingDatasets={form.isLoadingDatasets}
        selectedDataset={form.selectedDataset}
        onSelectDataset={form.onSelectDataset}
        onToggleAllLines={form.setAllRows}
        wantAllLines={form.wantAllLines}
        fromLine={form.fromLine}
        toLine={form.toLine}
        onChangeFromLine={form.setFromLine}
        onChangeToLine={form.setToLine}
        headers={form.headers}
        parametersList={form.parametersList}
        onParametersChange={form.onParameterChange}
        parameters={form.parameters}
      />
    </Modal>
  )
}
