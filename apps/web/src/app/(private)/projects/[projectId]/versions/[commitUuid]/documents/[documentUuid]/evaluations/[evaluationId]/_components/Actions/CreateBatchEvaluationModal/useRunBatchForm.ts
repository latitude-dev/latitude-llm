import { useCallback, useMemo, useState } from 'react'
import type { ConversationMetadata } from 'promptl-ai'
import { DocumentVersion } from '@latitude-data/core/browser'
import { getDatasetCount } from '$/lib/datasetsUtils'
import useDatasetRowsCount from '$/stores/datasetRowsCount'
import { useLabels } from './useLabels'
import { useMappedParameters } from './useMappedParameters'

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
  const [wantAllLines, setAllRows] = useState(true)
  const [fromLine, setFromLine] = useState<number>(1)
  const [toLine, setToLine] = useState<number | undefined>(undefined)
  const { labels, buildLabels } = useLabels()
  const {
    headers,
    parameters,
    selectedDataset,
    onSelectDataset,
    onParameterChange,
    isLoadingDatasets,
    datasets,
  } = useMappedParameters({
    parametersList,
    document,
    onFetched: (selected) => {
      buildLabels(selected)
    },
    onSelectedDataset: (selected) => {
      setFromLine(1)
      buildLabels(selected)
    },
  })
  const [datasetLabel, setDatasetLabel] = useState<string | undefined>(
    undefined,
  )

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
