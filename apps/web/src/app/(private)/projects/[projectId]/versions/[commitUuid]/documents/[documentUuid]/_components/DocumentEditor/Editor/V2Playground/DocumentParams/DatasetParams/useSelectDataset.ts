import { useCallback, useMemo, useState } from 'react'
import useDatasetsV2 from '$/stores/datasets'
import { useDatasetRowsForParameters } from './useDatasetRowsForParameters'
import { useDatasetRowPosition } from './useRowPosition'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'

import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import {
  InputSource,
  LinkedDatasetRow,
} from '@latitude-data/core/lib/documentPersistedInputs'

function getDatasetRowId({
  datasetId,
  document,
  local,
}: {
  datasetId: number
  local: Record<number, LinkedDatasetRow> | undefined
  document: DocumentVersion
}) {
  const localData = local?.[datasetId]
  const serverData = document.linkedDatasetAndRow?.[datasetId]

  const serverRowId = serverData?.datasetRowId
  const localRowId = localData?.datasetRowId
  return serverRowId ?? localRowId
}

export function useSelectDataset({
  document,
  commitVersionUuid,
}: {
  document: DocumentVersion
  commitVersionUuid: string
  source: InputSource
}) {
  const [selectedDataset, setSelectedDataset] = useState<Dataset | undefined>()
  const { position, getPosition, setPosition, isLoadingPosition } =
    useDatasetRowPosition()
  const { datasetV2: localDatasetData } = useDocumentParameters({
    document,
    commitVersionUuid,
  })
  const { data: datasets, isLoading: isLoadingDatasets } = useDatasetsV2({
    onFetched: async (data) => {
      const selectedDs = data.find((ds) => ds.id === document.datasetV2Id)
      if (!selectedDs) return

      const datasetRowId = getDatasetRowId({
        datasetId: selectedDs.id,
        document,
        local: localDatasetData.assignedDatasets,
      })
      await getPosition({
        dataset: selectedDs as Dataset,
        datasetRowId,
      })

      setSelectedDataset(selectedDs)
    },
  })
  const datasetOptions = useMemo(
    () => datasets.map((ds) => ({ value: ds.id, label: ds.name })),
    [datasets],
  )
  const onSelectDataset = useCallback(
    async (value: number) => {
      const ds = datasets.find((ds) => ds.id === Number(value))
      if (!ds) return

      const datasetRowId = getDatasetRowId({
        datasetId: ds.id,
        document,
        local: localDatasetData.assignedDatasets,
      })
      await getPosition({
        dataset: ds as Dataset,
        datasetRowId,
      })
      setSelectedDataset(ds)
    },
    [datasets, document, localDatasetData.assignedDatasets, getPosition],
  )

  const rowsData = useDatasetRowsForParameters({
    document,
    commitVersionUuid,
    dataset: selectedDataset as Dataset | undefined,
    position,
    setPosition,
  })

  return {
    ...rowsData,
    datasetOptions,
    selectedDataset,
    onSelectDataset,
    loadingState: {
      datasets: isLoadingDatasets,
      position: isLoadingPosition,
      rows: rowsData.loadingState.rows,
      isAssigning: localDatasetData.isAssigning,
      count: rowsData.loadingState.count,
    },
  }
}

export type UseSelectDataset = ReturnType<typeof useSelectDataset>
