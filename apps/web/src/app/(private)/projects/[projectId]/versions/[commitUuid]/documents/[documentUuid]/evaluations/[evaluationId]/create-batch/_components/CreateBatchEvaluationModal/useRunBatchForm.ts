import { useCallback, useMemo, useState } from 'react'

import { ConversationMetadata } from '@latitude-data/compiler'
import { Dataset } from '@latitude-data/core/browser'
import { SelectOption } from '@latitude-data/web-ui'
import useDatasets from '$/stores/datasets'

import { RunBatchParameters } from './useRunBatch'

function buildEmptyParameters(parameters: string[]) {
  return parameters.reduce((acc, key) => {
    acc[key] = undefined
    return acc
  }, {} as RunBatchParameters)
}

export function useRunBatchForm({
  documentMetadata,
}: {
  documentMetadata: ConversationMetadata
}) {
  const parametersList = useMemo(
    () => Array.from(documentMetadata.parameters),
    [documentMetadata.parameters],
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
      setParameters((prev) => ({
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
