import { useState } from 'react'
import { DatasetVersion, DocumentVersion } from '@latitude-data/core/browser'
import useDatasetRowsCount from '$/stores/datasetRowsCount'
import { getDatasetCount } from '$/hooks/useVersionedDatasets'
import { useMetadataParameters } from '$/hooks/useDocumentParameters/metadataParametersStore'
import { useMappedParameters } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/evaluations/[evaluationId]/_components/Actions/CreateBatchEvaluationModal/useMappedParameters'

export function useRunDocumentInBatchForm({
  document,
}: {
  document: DocumentVersion
}) {
  const parametersList = useMetadataParameters().metadataParameters ?? []
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
  })
  const [wantAllLines, setAllRows] = useState(true)
  const [fromLine, setFromLine] = useState<number>(1)
  const [toLine, setToLine] = useState<number | undefined>(undefined)
  const { data: datasetRowsCount } = useDatasetRowsCount({
    dataset: selectedDataset,
    onFetched: (count) => {
      setToLine(() => count)
    },
  })
  const maxLineCount = getDatasetCount(selectedDataset, datasetRowsCount)
  return {
    datasets,
    isLoadingDatasets,
    selectedDataset,
    datasetVersion: DatasetVersion.V2,
    headers,
    wantAllLines,
    fromLine,
    toLine,
    parameters,
    parametersList: parametersList ?? [],
    onParameterChange,
    onSelectDataset,
    setAllRows,
    setFromLine,
    setToLine,
    maxLineCount,
  }
}
