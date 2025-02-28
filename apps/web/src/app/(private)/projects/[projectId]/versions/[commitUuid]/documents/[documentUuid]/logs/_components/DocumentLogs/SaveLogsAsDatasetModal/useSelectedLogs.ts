import { createDatasetFromLogsAction } from '$/actions/datasetsV2/createFromLogs'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { SelectableRowsHook } from '$/hooks/useSelectableRows'
import { useToggleModal } from '$/hooks/useToogleModal'
import { ROUTES } from '$/services/routes'
import { DatasetV2 } from '@latitude-data/core/browser'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { DatasetRowData } from '@latitude-data/core/schema'
import { useCallback, useState } from 'react'
import useSWR, { SWRConfiguration } from 'swr'

type Row = DatasetRowData[keyof DatasetRowData][]
type InputItem = {
  columns: DatasetV2['columns']
  existingRows: DatasetRowData[]
  newRows: DatasetRowData[]
}

export type OutputItem = {
  columns: DatasetV2['columns']
  datasetRows: Row[]
  previewRows: Row[]
}

function serializeRows(item: InputItem): OutputItem {
  const columns = item.columns
  return {
    columns,
    datasetRows: item.existingRows.map((row) =>
      columns.map(({ identifier }) => row[identifier] ?? null),
    ),
    previewRows: item.newRows.map((row) =>
      columns.map(({ identifier }) => row[identifier] ?? null),
    ),
  }
}

const EMPTY_DATA = {
  columns: [] as DatasetV2['columns'],
  datasetRows: [] as Row[],
  previewRows: [] as Row[],
}

function usePreviewRowsStore(
  {
    dataset,
    documentLogIds,
  }: { dataset?: DatasetV2; documentLogIds: (string | number)[] },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher(ROUTES.api.datasetsV2.previewLogs.root, {
    serializer: serializeRows,
    searchParams: compactObject({
      name: dataset?.name,
      documentLogIds,
    }) as Record<string, string>,
  })
  const cacheKey = [
    'previewLogsForDataset',
    dataset?.id ?? 'no_dataset',
    documentLogIds,
  ]
  const {
    data = EMPTY_DATA,
    mutate: fetchPreview,
    isLoading,
  } = useSWR<OutputItem>(cacheKey, fetcher, {
    ...opts,
    revalidateOnMount: false,
    revalidateOnFocus: false,
    revalidateIfStale: false,
    dedupingInterval: 60000,
  })

  return { previewData: data, fetchPreview, isLoading }
}

export function useSelectedLogs({
  selectableState,
}: {
  selectableState: SelectableRowsHook
}) {
  const previewModalState = useToggleModal()
  const [selectedLogsIds, setSelectedLogsIds] = useState<(string | number)[]>(
    [],
  )
  const [selectedDataset, setSelectedDataset] = useState<DatasetV2>()
  const { previewData, fetchPreview, isLoading } = usePreviewRowsStore({
    dataset: selectedDataset,
    documentLogIds: selectedLogsIds,
  })
  const onClickShowPreview = useCallback(() => {
    previewModalState.onOpen()
    setSelectedLogsIds(selectableState.getSelectedRowIds())
    fetchPreview()
  }, [
    fetchPreview,
    setSelectedLogsIds,
    previewModalState.onOpen,
    selectableState.getSelectedRowIds,
  ])
  const {
    execute: createDatasetFromLogs,
    isPending: isSaving,
    error,
  } = useLatitudeAction(createDatasetFromLogsAction)
  const saveDataset = useCallback(
    async ({ name }: { name: string }) => {
      const [_data, err] = await createDatasetFromLogs({
        name,
        documentLogIds: selectedLogsIds,
      })
      if (err) return

      setSelectedDataset(undefined)
      setSelectedLogsIds([])
      selectableState.clearSelections()
      previewModalState.onClose()
    },
    [
      setSelectedDataset,
      selectedLogsIds,
      setSelectedLogsIds,
      createDatasetFromLogs,
      previewModalState.onClose,
      selectableState.clearSelections,
    ],
  )
  return {
    previewData,
    onClickShowPreview,
    saveDataset,
    isLoadingPreview: isLoading,
    previewModalState,
    setSelectedDataset,
    selectedDataset,
    isSaving,
    fetchPreview,
    error,
  }
}

export type PreviewLogsState = ReturnType<typeof useSelectedLogs>
