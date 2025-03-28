import { useCallback, useMemo, useState } from 'react'

import {
  Dataset,
  DocumentVersion,
  DatasetV2,
  InputSource,
  DatasetVersion,
} from '@latitude-data/core/browser'
import {
  useCurrentCommit,
  useCurrentProject,
  useToast,
} from '@latitude-data/web-ui'
import { useVersionedDatasets } from '$/hooks/useVersionedDatasets'
import { useDatasetRowsForParameters } from './useDatasetRowsForParameters'
import { useDatasetRowPosition } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/Playground/DocumentParams/DatasetParams/useRowPosition'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { executeFetch } from '$/hooks/useFetcher'
import {
  ClientDatasetRow,
  serializeRows,
} from '$/stores/datasetRows/rowSerializationHelpers'
import { DATASET_ROWS_ROUTE } from '$/stores/datasetRows'
import { useNavigate } from '$/hooks/useNavigate'

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
  const { toast } = useToast()
  const navigate = useNavigate()
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

      const all = localDatasetData.assignedDatasets
      const datasetRowId = all[ds.id]?.datasetRowId
      const selectedDs = ds as DatasetV2
      const dsPosition = await getPosition({
        dataset: selectedDs,
        datasetRowId,
      })
      const rows = await executeFetch<ClientDatasetRow[]>({
        navigate,
        toast,
        route: DATASET_ROWS_ROUTE,
        serializer: serializeRows(selectedDs.columns),
        searchParams: {
          page: dsPosition === undefined ? undefined : String(dsPosition),
          pageSize: '1', // Paginatinate one by one in document parameters
        } as Record<string, string>,
      })
      const row = rows?.[0]
      const inputsForDataset = all[ds.id]?.inputs ?? {}
      const mappedInputsForDataset = all[ds.id]?.mappedInputs ?? {}
      localDatasetData.setDataset({
        datasetId: ds.id,
        datasetVersion: DatasetVersion.V2,
        data: row
          ? {
              inputs: inputsForDataset,
              mappedInputs: mappedInputsForDataset,
              datasetRowId: row.id,
            }
          : undefined,
      })

      setSelectedDataset(ds)
    },
    [
      navigate,
      datasets,
      datasetVersion,
      project.id,
      document.documentUuid,
      commit.uuid,
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
      count: rowsData.loadingState.count,
    },
  }
}

export type UseSelectDataset = ReturnType<typeof useSelectDataset>
