import { useCallback, useMemo, useState } from 'react'

import {
  Dataset,
  DocumentVersion,
  DatasetV2,
  InputSource,
  DatasetVersion,
} from '@latitude-data/core/browser'
import { useCurrentCommit, useCurrentProject } from '@latitude-data/web-ui'
import useDocumentVersions from '$/stores/documentVersions'
import { useVersionedDatasets } from '$/hooks/useVersionedDatasets'
import { useDatasetRowsForParameters } from './useDatasetRowsForParameters'
import { useDatasetV1RowsForParamaters } from './useDatasetRowsForParameters/useDatasetV1RowsForParamaters'
import { useDatasetRowPosition } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/Playground/DocumentParams/DatasetParams/useRowPosition'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'

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
  const { assignDataset } = useDocumentVersions({})
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
    onFetched: async (data, datasetVersion) => {
      const isV1 = datasetVersion === DatasetVersion.V1
      const documentAttr = isV1 ? 'datasetId' : 'datasetV2Id'
      const selectedDs = data.find((ds) => ds.id === document[documentAttr])

      if (!isV1) {
        await getPosition({
          dataset: selectedDs as DatasetV2,
          datasetRowId: localDatasetData.datasetRowId,
        })
      }

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

      await assignDataset({
        projectId: project.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        datasetId: ds.id,
        datasetVersion,
      })

      if (datasetVersion === DatasetVersion.V2) {
        await getPosition({
          dataset: ds as DatasetV2,
          datasetRowId: localDatasetData.datasetRowId,
        })
      }

      setSelectedDataset(ds)
    },
    [
      datasets,
      datasetVersion,
      assignDataset,
      project.id,
      document.documentUuid,
      commit.uuid,
    ],
  )

  const isV1 = datasetVersion === DatasetVersion.V1
  const rowsV1 = useDatasetV1RowsForParamaters({
    document,
    commitVersionUuid,
    dataset: isV1 ? (selectedDataset as Dataset) : undefined,
  })

  const rowsV2 = useDatasetRowsForParameters({
    document,
    commitVersionUuid,
    dataset: !isV1 ? (selectedDataset as DatasetV2) : undefined,
    position,
    setPosition,
  })

  const rowsData = isV1 ? rowsV1 : rowsV2
  // TODO: Legacy. Remove after delete v1 code
  const isLoading = isLoadingDatasets || isLoadingPosition || rowsData.isLoading

  return {
    ...rowsData,
    datasetOptions,
    selectedDataset,
    onSelectDataset,
    isLoading,
    loadingState: {
      datasets: isLoadingDatasets,
      position: isLoadingPosition,
      rows: rowsData.loadingState?.rows ?? false,
      count: rowsData.loadingState?.count ?? false,
    },
  }
}

export type UseSelectDataset = ReturnType<typeof useSelectDataset>
