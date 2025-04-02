import { useCallback, useMemo, useState } from 'react'

import {
  Dataset,
  DocumentVersion,
  DatasetV2,
  InputSource,
  DatasetVersion,
  LinkedDatasetRow,
} from '@latitude-data/core/browser'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useVersionedDatasets } from '$/hooks/useVersionedDatasets'
import { useDatasetRowsForParameters } from './useDatasetRowsForParameters'
import { useDatasetRowPosition } from './useRowPosition'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'

function getDatasetRowId({
  datasetId,
  document,
  local,
}: {
  datasetId: number
  local: Record<number, LinkedDatasetRow>
  document: DocumentVersion
}) {
  const localData = local[datasetId]
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
  const [selectedDataset, setSelectedDataset] = useState<
    Dataset | DatasetV2 | undefined
  >()
  const { position, getPosition, setPosition, isLoadingPosition } =
    useDatasetRowPosition()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { datasetV2: localDatasetData } = useDocumentParameters({
    document,
    commitVersionUuid,
    datasetVersion: DatasetVersion.V2,
  })
  const {
    data: datasets,
    isLoading: isLoadingDatasets,
    datasetVersion,
  } = useVersionedDatasets({
    onFetched: async (data) => {
      const selectedDs = data.find((ds) => ds.id === document.datasetV2Id)
      if (!selectedDs) return

      const datasetRowId = getDatasetRowId({
        datasetId: selectedDs.id,
        document,
        local: localDatasetData.assignedDatasets,
      })
      await getPosition({
        dataset: selectedDs as DatasetV2,
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
        dataset: ds as DatasetV2,
        datasetRowId,
      })
      setSelectedDataset(ds)
    },
    [
      datasets,
      datasetVersion,
      project.id,
      document.documentUuid,
      commit.uuid,
      localDatasetData.assignedDatasets,
    ],
  )

  const rowsData = useDatasetRowsForParameters({
    document,
    commitVersionUuid,
    dataset: selectedDataset as DatasetV2 | undefined,
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
