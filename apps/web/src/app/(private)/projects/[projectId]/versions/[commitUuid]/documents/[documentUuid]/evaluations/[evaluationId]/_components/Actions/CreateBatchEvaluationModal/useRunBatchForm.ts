import { useCallback, useMemo, useState } from 'react'

import {
  Dataset,
  DatasetV2,
  DatasetVersion,
  DocumentVersion,
} from '@latitude-data/core/browser'
import type { ConversationMetadata } from 'promptl-ai'
import { SelectOption, useCurrentCommit } from '@latitude-data/web-ui'
import { useMappedParametersFromLocalStorage } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/batch/_components/RunPromptInBatchModal/useMappedParametersFromLocalStorage'
import useDatasets from '$/stores/datasets'
import useDatasetsV2 from '$/stores/datasetsV2'

import { RunBatchParameters } from './useRunBatch'
import { useFeatureFlag } from '$/hooks/useFeatureFlag'
import useDatasetRowsCount from '$/stores/datasetRowsCount'

/**
 * FIXME: Remove this when datasets V2 are open for everyone
 */
function useVersionedDatasets({
  onFetched,
}: {
  onFetched: (datasets: (Dataset | DatasetV2)[]) => void
}) {
  const { data: hasDatasetsV2, isLoading } = useFeatureFlag()
  const { data: datasetsV1, isLoading: isLoadingDatasetsV1 } = useDatasets({
    enabled: !isLoading && !hasDatasetsV2,
    onFetched: (datasets) => {
      onFetched(datasets)
    },
  })
  const { data: datasetsV2, isLoading: isLoadingDatasetsV2 } = useDatasetsV2({
    enabled: !isLoading && hasDatasetsV2,
    onFetched: (datasets) => {
      onFetched(datasets)
    },
    pageSize: '100000', // Big enough page to avoid pagination
  })

  return {
    data: hasDatasetsV2 ? datasetsV2 : datasetsV1,
    datasetVersion: hasDatasetsV2 ? DatasetVersion.V2 : DatasetVersion.V1,
    isLoading: isLoading || isLoadingDatasetsV1 || isLoadingDatasetsV2,
  }
}

function buildColumnList(dataset: Dataset | DatasetV2 | null) {
  if (!dataset) return []

  return 'fileMetadata' in dataset
    ? dataset.fileMetadata.headers
    : 'columns' in dataset
      ? dataset.columns.map((c) => c.name)
      : []
}

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
  const [selectedDataset, setSelectedDataset] = useState<
    Dataset | DatasetV2 | null
  >(null)
  const [headers, setHeaders] = useState<SelectOption<string>[]>([])
  const buildHeaders = useCallback(
    (dataset: Dataset | DatasetV2) => {
      setHeaders([
        { value: '-1', label: '-- Leave this parameter empty' },
        ...buildColumnList(dataset).map((value) => ({ value, label: value })),
      ])
    },
    [setHeaders, selectedDataset],
  )
  const {
    data: datasets,
    isLoading: isLoadingDatasets,
    datasetVersion,
  } = useVersionedDatasets({
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
      const columns = buildColumnList(selectedDataset)
      setParameters((prev) => ({
        ...prev,
        [param]:
          columns.indexOf?.(header) !== -1
            ? columns.indexOf(header)
            : undefined,
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

      // DEPRECATED: Legacy datasets
      if ('fileMetadata' in ds) {
        setToLine(ds.fileMetadata.rowCount)
      }

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
  const { data: datasetRowsCount } = useDatasetRowsCount({
    dataset:
      selectedDataset && 'columns' in selectedDataset
        ? selectedDataset
        : undefined,
    onFetched: (count) => {
      setToLine(() => count)
    },
  })

  const maxLineCount = selectedDataset
    ? 'fileMetadata' in selectedDataset
      ? selectedDataset.fileMetadata.rowCount
      : datasetRowsCount
    : undefined
  const onToggleAllLines = useCallback(
    (wantAllLines: boolean) => {
      if (wantAllLines) {
        setToLine(() => maxLineCount)
      }
      setAllRows(wantAllLines)
    },
    [maxLineCount],
  )

  return {
    datasets,
    isLoadingDatasets,
    selectedDataset,
    datasetVersion,
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
    maxLineCount,
    onToggleAllLines,
  }
}
