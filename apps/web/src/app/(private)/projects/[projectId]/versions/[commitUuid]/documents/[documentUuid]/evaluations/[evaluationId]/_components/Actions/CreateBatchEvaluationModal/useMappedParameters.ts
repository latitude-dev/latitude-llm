import { useCallback, useEffect, useState } from 'react'

import { buildColumnList, getColumnIndex } from '$/hooks/useVersionedDatasets'
import { DatasetV2, DocumentVersion } from '@latitude-data/core/browser'
import useDatasets from '$/stores/datasetsV2'
import type { SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { type RunBatchParameters } from './useRunBatch'

function buildEmptyParameters(parameters: string[]) {
  return parameters.reduce((acc, key) => {
    acc[key] = undefined
    return acc
  }, {} as RunBatchParameters)
}

export function useMappedParameters({
  parametersList,
  document,
  onFetched,
}: {
  parametersList: string[]
  document: DocumentVersion
  onSelectedDataset?: (dataset: DatasetV2) => void
  onFetched?: (dataset: DatasetV2) => void
}) {
  const [selectedDataset, setSelectedDataset] = useState<DatasetV2 | null>(null)
  const buildMappedInputs = useCallback(
    (dataset: DatasetV2) => {
      if (!document?.linkedDatasetAndRow) return {}
      return document.linkedDatasetAndRow[dataset.id]?.mappedInputs ?? {}
    },
    [document.linkedDatasetAndRow],
  )
  const [headers, setHeaders] = useState<SelectOption<string>[]>([])
  const [parameters, setParameters] = useState(() =>
    buildEmptyParameters(parametersList),
  )
  const buildHeaders = useCallback(
    (dataset: DatasetV2) => {
      setHeaders([
        { value: '-1', label: '-- Leave this parameter empty' },
        ...buildColumnList(dataset).map((value) => ({ value, label: value })),
      ])
    },
    [setHeaders],
  )

  const onParameterChange = useCallback(
    (param: string) => (header: string) => {
      const columns = buildColumnList(selectedDataset)
      setParameters((prev) => ({
        ...prev,
        [param]: getColumnIndex(columns, header),
      }))
    },
    [selectedDataset],
  )

  const buildSelectedParameters = useCallback(
    (dataset: DatasetV2) => {
      const mappedInputs = buildMappedInputs(dataset)
      const mappedParameters = Object.fromEntries(
        Object.entries(mappedInputs).map(([key, identifier]) => {
          const index = dataset.columns.findIndex(
            (col) => col.identifier === identifier,
          )
          return [key, index]
        }),
      )

      setParameters((prev: RunBatchParameters) => ({
        ...prev,
        ...buildEmptyParameters(parametersList),
        ...mappedParameters,
      }))
    },
    [setParameters, parametersList],
  )
  const setupDataset = useCallback(
    (selectedDataset: DatasetV2) => {
      setSelectedDataset(selectedDataset)
      buildHeaders(selectedDataset)
      buildSelectedParameters(selectedDataset)
      onFetched?.(selectedDataset)
    },
    [buildHeaders, buildSelectedParameters, setSelectedDataset, onFetched],
  )
  const { data: datasets, isLoading: isLoadingDatasets } = useDatasets({
    onFetched: (datasets) => {
      const selected = datasets.find((d) => d.id === document.datasetV2Id)
      if (!selected) return

      setupDataset(selected)
      onFetched?.(selected)
    },
    pageSize: '100000', // Big enough page to avoid pagination
  })

  const onSelectDataset = useCallback(
    async (value: number) => {
      const ds = datasets.find((ds) => ds.id === Number(value))
      if (!ds) return

      setupDataset(ds)
    },
    [datasets, setupDataset],
  )

  useEffect(() => {
    const fn = async () => {
      if (!document) return

      // Only choose the dataset if it's not already selected
      const ds = selectedDataset
        ? undefined
        : datasets.find((ds) => ds.id === document.datasetV2Id)

      if (!ds) return

      setupDataset(ds)
    }

    fn()
  }, [document, selectedDataset, datasets, setupDataset])

  return {
    datasets,
    isLoadingDatasets,
    parameters,
    headers,
    selectedDataset,
    onParameterChange,
    onSelectDataset,
  }
}
