import { useCallback, useMemo, useState } from 'react'

import { Dataset, DocumentVersion } from '@latitude-data/core/browser'
import type { ConversationMetadata } from '@latitude-data/promptl'
import { SelectOption, useCurrentCommit } from '@latitude-data/web-ui'
import { useMappedParametersFromLocalStorage } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/batch/_components/RunPromptInBatchModal/useMappedParametersFromLocalStorage'
import useDatasets from '$/stores/datasets'

import { RunBatchParameters } from './useRunBatch'

export function buildEmptyParameters(parameters: string[]) {
  return parameters.reduce((acc, key) => {
    acc[key] = undefined
    return acc
  }, {} as RunBatchParameters)
}

export function useRunBatchForm({
  document,
  documentMetadata,
}: {
  document: DocumentVersion
  documentMetadata?: ConversationMetadata
}) {
  const parametersList = useMemo(
    () => Array.from(documentMetadata?.parameters ?? []),
    [documentMetadata?.parameters],
  )
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null)
  const [headers, setHeaders] = useState<SelectOption<string>[]>([])
  const buildHeaders = useCallback(
    (dataset: Dataset) => {
      setHeaders([
        { value: '-1', label: '-- Leave this parameter empty' },
        ...dataset.fileMetadata.headers.map((header) => ({
          value: header,
          label: header,
        })),
      ])
    },
    [setHeaders, selectedDataset],
  )
  const { data: datasets, isLoading: isLoadingDatasets } = useDatasets({
    onFetched: (ds) => {
      const selected = ds.find((d) => d.id === document.datasetId)
      if (!selected) return

      setSelectedDataset(selected)
      buildHeaders(selected)
    },
  })
  const [wantAllLines, setAllRows] = useState(true)
  const [fromLine, setFromLine] = useState<number | undefined>(undefined)
  const [toLine, setToLine] = useState<number | undefined>(undefined)
  const [parameters, setParameters] = useState(() =>
    buildEmptyParameters(parametersList),
  )

  const onParameterChange = useCallback(
    (param: string) => (header: string) => {
      setParameters((prev) => ({
        ...prev,
        [param]: selectedDataset?.fileMetadata?.headers?.indexOf?.(header),
      }))
    },
    [selectedDataset],
  )

  const onSelectDataset = useCallback(
    async (value: number) => {
      const ds = datasets.find((ds) => ds.id === Number(value))
      if (!ds) return

      setSelectedDataset(ds)
      setParameters(buildEmptyParameters(parametersList))
      setFromLine(1)
      setToLine(ds.fileMetadata.rowCount)
      buildHeaders(ds)
    },
    [parametersList, datasets, buildHeaders],
  )

  const { commit } = useCurrentCommit()
  useMappedParametersFromLocalStorage({
    document,
    commitVersionUuid: commit.uuid,
    parametersList,
    selectedDataset,
    onDatasetReady: ({ mapped }) => {
      setParameters(mapped)
    },
  })
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
