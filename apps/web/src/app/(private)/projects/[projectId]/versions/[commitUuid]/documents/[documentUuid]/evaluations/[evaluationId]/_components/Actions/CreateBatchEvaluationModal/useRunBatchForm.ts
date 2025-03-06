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

import { RunBatchParameters } from './useRunBatch'
import useDatasetRowsCount from '$/stores/datasetRowsCount'
import {
  buildColumnList,
  getColumnIndex,
  getDatasetCount,
  useVersionedDatasets,
} from '$/hooks/useVersionedDatasets'

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
    onFetched: (ds, dsVersion) => {
      const identifier =
        dsVersion === DatasetVersion.V1 ? 'datasetId' : 'datasetV2Id'
      const selected = ds.find((d) => d.id === document[identifier])
      if (!selected) return

      setSelectedDataset(selected)
      buildHeaders(selected)
    },
  })
  const [wantAllLines, setAllRows] = useState(true)
  const [fromLine, setFromLine] = useState<number>(1)
  const [toLine, setToLine] = useState<number | undefined>(undefined)
  const [parameters, setParameters] = useState(() =>
    buildEmptyParameters(parametersList),
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

  // TODO: Remove after datasets 2 migration
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
    dataset: selectedDataset,
    onFetched: (count) => {
      setToLine(() => count)
    },
  })
  const maxLineCount = getDatasetCount(selectedDataset, datasetRowsCount)

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
