import { createDatasetFromLogsAction } from '$/actions/datasets/createFromLogs'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { SelectableRowsHook } from '$/hooks/useSelectableRows'
import { useToggleModal } from '$/hooks/useToogleModal'
import { usePreviewLogs } from '$/stores/previewLogs'
import {
  Dataset,
  ExtendedDocumentLogFilterOptions,
} from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useCallback, useMemo, useState } from 'react'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'

const DEFAULT_STATIC_COLUMNS = ['output', 'id', 'tokens']

export function useSaveLogsAsDatasetModal({
  selectableState,
  extendedFilterOptions,
}: {
  selectableState: SelectableRowsHook
  extendedFilterOptions: ExtendedDocumentLogFilterOptions
}) {
  const { toast } = useToast()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const state = useToggleModal()
  const [selectedLogsIds, setSelectedLogsIds] = useState<(string | number)[]>(
    [],
  )
  const [selectedCount, setSelectedCount] = useState(0)
  const [selectedDataset, setSelectedDataset] = useState<Dataset>()
  const {
    previewData: data,
    fetchPreview,
    isLoading,
  } = usePreviewLogs({
    documentUuid: document.documentUuid,
    extendedFilterOptions,
    staticColumnNames: DEFAULT_STATIC_COLUMNS,
  })

  const onClickShowPreview = useCallback(() => {
    state.onOpen()
    setSelectedLogsIds(selectableState.getSelectedRowIds())
    setSelectedCount(selectableState.selectedCount)
    fetchPreview()
  }, [
    fetchPreview,
    setSelectedLogsIds,
    state.onOpen,
    selectableState.getSelectedRowIds,
  ])

  const {
    execute: createDatasetFromLogs,
    isPending: isSaving,
    error,
  } = useLatitudeAction(createDatasetFromLogsAction, {
    onSuccess: ({ data }) => {
      if (data.mode === 'sync') {
        toast({
          title: selectedDataset ? 'Updated dataset' : 'Created dataset',
          description: selectedDataset
            ? `The selected logs have been added to dataset ${selectedDataset.name}.`
            : 'The selected logs have been added to a new dataset.',
        })
      } else {
        toast({
          title: selectedDataset
            ? 'Updating dataset...'
            : 'Creating dataset...',
          description: selectedDataset
            ? 'The selected logs are being added to the selected dataset. You will be notified by email when the dataset is ready.'
            : 'The selected logs are being added to a new dataset. You will be notified by email when the dataset is ready.',
        })
      }

      setSelectedDataset(undefined)
      setSelectedLogsIds([])
      setSelectedCount(0)
      selectableState.clearSelections()
      state.onClose()
    },
    onError: ({ err }) => {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      })
    },
  })

  const saveDataset = useCallback(
    async ({ name }: { name: string }) => {
      if (selectableState.selectionMode === 'NONE') return // invalid state

      await createDatasetFromLogs({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        name,
        extendedFilterOptions,
        count: selectableState.selectedCount,
      })
    },
    [
      setSelectedDataset,
      selectedLogsIds,
      setSelectedLogsIds,
      createDatasetFromLogs,
      state.onClose,
      selectableState.clearSelections,
    ],
  )
  return useMemo(
    () => ({
      data,
      state,
      onClickShowPreview,
      saveDataset,
      isLoadingPreview: isLoading,
      setSelectedDataset,
      selectedDataset,
      isSaving,
      fetchPreview,
      error,
      selectedCount,
    }),
    [
      data,
      state,
      onClickShowPreview,
      saveDataset,
      isLoading,
      setSelectedDataset,
      selectedDataset,
      isSaving,
      fetchPreview,
      error,
      selectedCount,
    ],
  )
}

export type SaveLogsAsDatasetModalState = ReturnType<
  typeof useSaveLogsAsDatasetModal
>
