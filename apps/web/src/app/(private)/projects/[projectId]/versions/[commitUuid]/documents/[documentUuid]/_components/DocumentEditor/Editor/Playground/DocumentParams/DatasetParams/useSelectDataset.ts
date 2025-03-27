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
  const [datasetsLoadedAtLeastOnce, setDatasetsLoadedAtLeastOnce] =
    useState<boolean>(false)
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { assignDataset } = useDocumentVersions({})
  const {
    data: datasets,
    isLoading: isLoadingDatasets,
    datasetVersion,
  } = useVersionedDatasets({
    onFetched: (data, datasetVersion) => {
      const isV1 = datasetVersion === DatasetVersion.V1
      const documentAttr = isV1 ? 'datasetId' : 'datasetV2Id'
      setDatasetsLoadedAtLeastOnce(true)
      setSelectedDataset(data.find((ds) => ds.id === document[documentAttr]))
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
    datasetIsReady: datasetsLoadedAtLeastOnce,
  })

  const rowsData = isV1 ? rowsV1 : rowsV2
  const isLoading = isLoadingDatasets || rowsData.isLoading

  return {
    ...rowsData,
    datasetOptions,
    selectedDataset,
    onSelectDataset,
    isLoading,
  }
}

export type UseSelectDataset = ReturnType<typeof useSelectDataset>
