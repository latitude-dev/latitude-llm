import { DocumentVersion } from '@latitude-data/core/browser'
import useDatasetRowsCount from '$/stores/datasetRowsCount'
import { getDatasetCount } from '$/lib/datasetsUtils'
import { useMetadataParameters } from '$/hooks/useDocumentParameters/metadataParametersStore'
import { useMappedParameters } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/evaluations/[evaluationId]/_components/Actions/CreateBatchEvaluationModal/useMappedParameters'
import { useRunBatchLineOptions } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/evaluations/[evaluationId]/_components/Actions/CreateBatchEvaluationModal/useLineOptions'

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
  const lineOptions = useRunBatchLineOptions()
  const { data: datasetRowsCount } = useDatasetRowsCount({
    dataset: selectedDataset,
    onFetched: (count) => {
      lineOptions.setToLine(() => count)
    },
  })
  const maxLineCount = getDatasetCount(selectedDataset, datasetRowsCount)
  return {
    ...lineOptions,
    datasets,
    isLoadingDatasets,
    selectedDataset,
    headers,
    parameters,
    parametersList: parametersList ?? [],
    onParameterChange,
    onSelectDataset,
    maxLineCount,
  }
}
