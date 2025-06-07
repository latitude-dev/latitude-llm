import { createDatasetFromLogsAction } from '$/actions/datasets/createFromLogs'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { SelectableRowsHook } from '$/hooks/useSelectableRows'
import { useToggleModal } from '$/hooks/useToogleModal'
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
import { usePreviewTable } from '../PreviewTable/usePreviewTable'

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
  const [selectedDataset, setSelectedDataset] = useState<Dataset>()
  const {
    previewData: data,
    fetchPreview,
    isLoading,
    isColumnSelected,
    handleSelectColumn,
  } = usePreviewTable({
    documentUuid: document.documentUuid,
    extendedFilterOptions,
    staticColumnNames: DEFAULT_STATIC_COLUMNS,
  })

  const onClickShowPreview = useCallback(() => {
    state.onOpen()
    fetchPreview()
  }, [fetchPreview, state])

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
      createDatasetFromLogs,
      extendedFilterOptions,
      project,
      commit,
      document,
      selectableState,
    ],
  )

  const previewSubtitle = useMemo(
    () =>
      `${selectableState.selectedCount} logs will be added to ${data.datasetRows.length > 0 ? 'the dataset' : 'a new dataset'}. This is a preview of representative ones based on its parameters.`,
    [selectableState, data],
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
      isColumnSelected,
      handleSelectColumn,
      previewSubtitle,
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
      isColumnSelected,
      handleSelectColumn,
      previewSubtitle,
    ],
  )
}

export type SaveLogsAsDatasetModalState = ReturnType<
  typeof useSaveLogsAsDatasetModal
>
