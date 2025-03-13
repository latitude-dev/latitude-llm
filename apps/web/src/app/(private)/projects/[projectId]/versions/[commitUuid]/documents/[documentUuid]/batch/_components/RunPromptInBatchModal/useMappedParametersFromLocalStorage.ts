import { useEffect } from 'react'

import {
  Dataset,
  DatasetV2,
  DatasetVersion,
  DocumentVersion,
} from '@latitude-data/core/browser'
import { RunBatchParameters } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/evaluations/[evaluationId]/_components/Actions/CreateBatchEvaluationModal/useRunBatch'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { useFeatureFlag } from '$/hooks/useFeatureFlag'

/**
 * TODO: Remove. This wont be needed after migrate to datasets v2
 *
 * This hook map parameters
 * from document.datasetId that are mapped in the
 * document paramters UI if any
 *
 * IMPORTANT: Other wise it will ignore if it's a different dataset
 */
export function useMappedParametersFromLocalStorage({
  document,
  commitVersionUuid,
  parametersList,
  onDatasetReady,
  selectedDataset,
}: {
  document: DocumentVersion
  commitVersionUuid: string
  parametersList: string[]
  selectedDataset: DatasetV2 | Dataset | null | undefined
  onDatasetReady: (_args: { mapped: RunBatchParameters }) => void
}) {
  const { data: hasDatasetsV2, isLoading: isLoadingFeatureFlag } =
    useFeatureFlag()
  const datasetVersion =
    hasDatasetsV2 && !isLoadingFeatureFlag
      ? DatasetVersion.V2
      : DatasetVersion.V1
  const {
    dataset: { mappedInputs },
  } = useDocumentParameters({
    document,
    commitVersionUuid,
    datasetVersion,
  })
  useEffect(() => {
    if (!selectedDataset) return
    if (selectedDataset.id !== document.datasetId) return

    const mappedParameters = parametersList.reduce((acc, key) => {
      acc[key] = mappedInputs?.[key]
      return acc
    }, {} as RunBatchParameters)

    onDatasetReady({ mapped: mappedParameters })
  }, [parametersList, document, selectedDataset, mappedInputs])
}
