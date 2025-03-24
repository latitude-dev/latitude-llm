import { DatasetHeadText } from '$/app/(private)/datasets/[datasetId]/DatasetDetailTable'
import { useMappedParametersFromLocalStorage } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/batch/_components/RunPromptInBatchModal/useMappedParametersFromLocalStorage'
import {
  buildColumnList,
  getColumnIndex,
  getDatasetCount,
  useVersionedDatasets,
} from '$/hooks/useVersionedDatasets'
import useDatasetRowsCount from '$/stores/datasetRowsCount'
import {
  Dataset,
  DatasetV2,
  DatasetVersion,
  DocumentVersion,
} from '@latitude-data/core/browser'
import { SelectOption, useCurrentCommit } from '@latitude-data/web-ui'
import type { ConversationMetadata } from 'promptl-ai'
import { useCallback, useMemo, useState } from 'react'
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
  const [labels, setLabels] = useState<SelectOption<string>[]>([])
  const buildLabels = useCallback(
    (dataset: DatasetV2) =>
      setLabels([
        ...dataset.columns
          .filter((column) => column.role === 'label')
          .map((column) => ({
            icon: DatasetHeadText({ text: '', role: column.role }),
            label: column.name,
            value: column.name,
          })),
        ...dataset.columns
          .filter((column) => column.role !== 'label')
          .map((column) => ({ label: column.name, value: column.name })),
      ]),
    [setLabels, selectedDataset],
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
      if ('columns' in selected) buildLabels(selected)
    },
  })
  const [datasetLabel, setDatasetLabel] = useState<string | undefined>(
    undefined,
  )
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
      if ('columns' in ds) buildLabels(ds)
    },
    [parametersList, datasets, buildHeaders, buildLabels],
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
    datasetLabel,
    headers,
    labels,
    wantAllLines,
    fromLine,
    toLine,
    parameters,
    parametersList,
    onParameterChange,
    onSelectDataset,
    setDatasetLabel,
    setAllRows,
    setFromLine,
    setToLine,
    maxLineCount,
    onToggleAllLines,
  }
}
