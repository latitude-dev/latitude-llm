'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { ConversationMetadata, readMetadata } from '@latitude-data/compiler'
import { Dataset, DocumentVersion } from '@latitude-data/core/browser'
import {
  Button,
  CloseTrigger,
  Modal,
  SelectOption,
  useCurrentCommit,
  useCurrentProject,
  useToast,
} from '@latitude-data/web-ui'
import { runDocumentInBatchAction } from '$/actions/documents/runDocumentInBatchAction'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useDatasets from '$/stores/datasets'

import DatasetForm from '../../../evaluations/[evaluationId]/_components/Actions/CreateBatchEvaluationModal/DatasetForm'
import { RunBatchParameters } from '../../../evaluations/[evaluationId]/_components/Actions/CreateBatchEvaluationModal/useRunBatch'
import { buildEmptyParameters } from '../../../evaluations/[evaluationId]/_components/Actions/CreateBatchEvaluationModal/useRunBatchForm'

function useRunDocumentInBatchForm(document: DocumentVersion) {
  const [metadata, setMetadata] = useState<ConversationMetadata | undefined>()
  useEffect(() => {
    const fn = async () => {
      if (!document || !document.content) return

      const metadata = await readMetadata({
        prompt: document.content,
      })

      setMetadata(metadata)
    }

    fn()
  }, [document])

  const parametersList = useMemo(
    () => Array.from(metadata?.parameters ?? []),
    [metadata?.parameters],
  )
  const { data: datasets, isLoading: isLoadingDatasets } = useDatasets()
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null)
  const [headers, setHeaders] = useState<SelectOption[]>([])
  const [wantAllLines, setAllRows] = useState(true)
  const [fromLine, setFromLine] = useState<number | undefined>(undefined)
  const [toLine, setToLine] = useState<number | undefined>(undefined)
  const [parameters, setParameters] = useState(() =>
    buildEmptyParameters(parametersList),
  )

  const onParameterChange = useCallback(
    (param: string) => (header: string) => {
      setParameters((prev: RunBatchParameters) => ({
        ...prev,
        [param]: selectedDataset?.fileMetadata?.headers?.indexOf?.(header),
      }))
    },
    [selectedDataset],
  )

  const onSelectDataset = useCallback(
    async (value: string) => {
      const ds = datasets.find((ds) => ds.id === Number(value))
      if (!ds) return

      setSelectedDataset(ds)
      setParameters(buildEmptyParameters(parametersList))
      setFromLine(1)
      setToLine(ds.fileMetadata.rowCount)
      setHeaders([
        { value: '-1', label: '-- Leave this parameter empty' },
        ...ds.fileMetadata.headers.map((header) => ({
          value: header,
          label: header,
        })),
      ])
    },
    [parametersList, datasets],
  )
  return {
    datasets,
    isLoadingDatasets,
    selectedDataset,
    headers,
    wantAllLines,
    fromLine,
    toLine,
    parameters,
    parametersList,
    onParameterChange,
    onSelectDataset,
    setAllRows,
    setFromLine,
    setToLine,
  }
}

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
      parameters,
      fromLine,
      toLine,
    }: {
      datasetId: number | undefined
      fromLine: number | undefined
      toLine: number | undefined
      wantAllLines: boolean
      parameters: RunBatchParameters
    }) => {
      await run({
        commitUuid,
        datasetId: datasetId!,
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
  const document = useCurrentDocument()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { toast } = useToast()

  const form = useRunDocumentInBatchForm(document)
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
      fromLine: form.fromLine,
      toLine: form.toLine,
      wantAllLines: form.wantAllLines,
      parameters: form.parameters,
    })
  }

  return (
    <Modal
      open
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
