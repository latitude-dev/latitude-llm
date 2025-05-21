import { createDatasetFromLogsAction } from '$/actions/datasets/createFromLogs'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { SelectableRowsHook } from '$/hooks/useSelectableRows'
import { useToggleModal } from '$/hooks/useToogleModal'
import { usePreviewLogs } from '$/stores/previewLogs'
import { Dataset } from '@latitude-data/core/browser'
import { useCallback, useState } from 'react'

const DEFAULT_STATIC_COLUMNS = ['output', 'id', 'tokens']

export function useSaveLogsAsDatasetModal({
  selectableState,
}: {
  selectableState: SelectableRowsHook
}) {
  const previewModalState = useToggleModal()
  const [selectedLogsIds, setSelectedLogsIds] = useState<(string | number)[]>(
    [],
  )
  const [selectedDataset, setSelectedDataset] = useState<Dataset>()
  const { previewData, fetchPreview, isLoading } = usePreviewLogs({
    dataset: selectedDataset,
    documentLogIds: selectedLogsIds,
    staticColumnNames: DEFAULT_STATIC_COLUMNS,
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
    data: previewData,
    state: previewModalState,
    onClickShowPreview,
    saveDataset,
    isLoadingPreview: isLoading,
    setSelectedDataset,
    selectedDataset,
    isSaving,
    fetchPreview,
    error,
  }
}

export type SaveLogsAsDatasetModalState = ReturnType<
  typeof useSaveLogsAsDatasetModal
>
