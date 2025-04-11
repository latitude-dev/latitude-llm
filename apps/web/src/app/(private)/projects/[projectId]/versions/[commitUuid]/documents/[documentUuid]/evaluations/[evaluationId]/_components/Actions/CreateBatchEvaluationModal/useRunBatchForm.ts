import { useCallback, useMemo, useState } from 'react'
import type { ConversationMetadata } from 'promptl-ai'
import { DocumentVersion } from '@latitude-data/core/browser'
import { getDatasetCount } from '$/lib/datasetsUtils'
import useDatasetRowsCount from '$/stores/datasetRowsCount'
import { useLabels } from './useLabels'
import { useMappedParameters } from './useMappedParameters'
import { useRunBatchLineOptions } from './useLineOptions'

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
  const lineOptions = useRunBatchLineOptions()
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
      lineOptions.setFromLine(1)
      buildLabels(selected)
    },
  })
  const [datasetLabel, setDatasetLabel] = useState<string | undefined>(
    undefined,
  )

  const { data: datasetRowsCount } = useDatasetRowsCount({
    dataset: selectedDataset,
    onFetched: (count) => {
      lineOptions.setToLine(() => count)
    },
  })
  const maxLineCount = getDatasetCount(selectedDataset, datasetRowsCount)

  const onToggleAllLines = useCallback(
    (wantAllLines: boolean) => {
      if (wantAllLines) {
        lineOptions.setToLine(() => maxLineCount)
      }
      lineOptions.setAllRows(wantAllLines)
    },
    [maxLineCount, lineOptions],
  )

  return {
    ...lineOptions,
    datasets,
    isLoadingDatasets,
    selectedDataset,
    datasetLabel,
    headers,
    labels,
    parameters,
    parametersList,
    onParameterChange,
    onSelectDataset,
    setDatasetLabel,
    maxLineCount,
    onToggleAllLines,
  }
}
