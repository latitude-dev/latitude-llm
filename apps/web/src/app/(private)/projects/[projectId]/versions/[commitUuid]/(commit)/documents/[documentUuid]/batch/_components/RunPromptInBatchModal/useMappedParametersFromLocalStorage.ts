import { useEffect } from 'react'

import { Dataset, DocumentVersion } from '@latitude-data/core/browser'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { RunBatchParameters } from '../../../evaluations/[evaluationId]/_components/Actions/CreateBatchEvaluationModal/useRunBatch'

/**
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
  selectedDataset: Dataset | null | undefined
  onDatasetReady: (_args: { mapped: RunBatchParameters }) => void
}) {
  const {
    dataset: { mappedInputs },
  } = useDocumentParameters({
    documentVersionUuid: document.documentUuid,
    commitVersionUuid,
  })
  useEffect(() => {
    if (!selectedDataset) return
    if (selectedDataset.id !== document.datasetId) return

    const mappedParameters = parametersList.reduce((acc, key) => {
      acc[key] = mappedInputs[key]
      return acc
    }, {} as RunBatchParameters)

    onDatasetReady({ mapped: mappedParameters })
  }, [parametersList, document, selectedDataset, mappedInputs])
}
