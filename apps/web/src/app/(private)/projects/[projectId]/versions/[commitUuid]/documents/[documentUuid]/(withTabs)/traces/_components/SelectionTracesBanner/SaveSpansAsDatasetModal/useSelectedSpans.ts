import { createDatasetFromSpansAction } from '$/actions/datasets/createFromSpans'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { SelectableRowsHook } from '$/hooks/useSelectableRows'
import { useToggleModal } from '$/hooks/useToogleModal'
import { ROUTES } from '$/services/routes'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { DatasetRowData } from '@latitude-data/core/schema/models/datasetRows'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCallback, useEffect, useMemo, useState } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'
import { parseRowCell } from '@latitude-data/core/services/datasetRows/utils'

type InputItem = {
  columns: Dataset['columns']
  existingRows: DatasetRowData[]
  newRows: DatasetRowData[]
}

export type OutputItem = {
  columns: Dataset['columns']
  datasetRows: string[][]
  previewRows: string[][]
}

function serializeRowData(
  rowData: DatasetRowData,
  columns: Dataset['columns'],
): string[] {
  return columns.map((column) => {
    const cell = rowData[column.identifier]
    return parseRowCell({ cell })
  })
}

function serializeRows(item: InputItem): OutputItem {
  const columns = item.columns
  return {
    columns,
    datasetRows: item.existingRows.map((row) => serializeRowData(row, columns)),
    previewRows: item.newRows.map((row) => serializeRowData(row, columns)),
  }
}

const EMPTY_DATA = {
  columns: [] as Dataset['columns'],
  datasetRows: [] as string[][],
  previewRows: [] as string[][],
}

function usePreviewRowsStore(
  {
    dataset,
    documentLogUuids,
  }: {
    dataset?: Dataset
    documentLogUuids: string[]
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher(ROUTES.api.datasets.previewSpans.root, {
    serializer: serializeRows,
    searchParams: compactObject({
      name: dataset?.name,
      documentLogUuids:
        documentLogUuids.length > 0
          ? JSON.stringify(documentLogUuids)
          : undefined,
    }) as Record<string, string>,
  })
  const cacheKey = [
    'previewSpansForDataset',
    dataset?.id ?? 'no_dataset',
    documentLogUuids,
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

export function useSelectedConversations({
  selectableState,
}: {
  selectableState: SelectableRowsHook
}) {
  const { toast } = useToast()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const previewModalState = useToggleModal()
  const [selectedDocumentLogUuids, setSelectedDocumentLogUuids] = useState<
    string[]
  >([])
  const [selectedCount, setSelectedCount] = useState(0)
  const [selectionMode, setSelectionMode] =
    useState<SelectableRowsHook['selectionMode']>('NONE')
  const [selectedDataset, setSelectedDataset] = useState<Dataset>()
  const { previewData, fetchPreview, isLoading } = usePreviewRowsStore({
    dataset: selectedDataset,
    documentLogUuids: selectedDocumentLogUuids,
  })
  const onClickShowPreview = useCallback(() => {
    previewModalState.onOpen()
    setSelectedDocumentLogUuids(selectableState.selectedRowIds.map(String))
    setSelectedCount(selectableState.selectedCount)
    setSelectionMode(selectableState.selectionMode)
  }, [
    previewModalState,
    setSelectedDocumentLogUuids,
    selectableState.selectedRowIds,
    selectableState.selectedCount,
    selectableState.selectionMode,
  ])

  useEffect(() => {
    if (previewModalState.open && selectedDocumentLogUuids.length > 0) {
      fetchPreview()
    }
  }, [previewModalState.open, selectedDocumentLogUuids, fetchPreview])

  const {
    execute: createDatasetFromSpans,
    isPending: isSaving,
    error,
  } = useLatitudeAction(createDatasetFromSpansAction, {
    onSuccess: ({ data }) => {
      if (data.mode === 'sync') {
        toast({
          title: selectedDataset ? 'Updated dataset' : 'Created dataset',
          description: selectedDataset
            ? `The selected spans have been added to dataset ${selectedDataset.name}.`
            : 'The selected spans have been added to a new dataset.',
        })
      } else {
        toast({
          title: selectedDataset
            ? 'Updating dataset...'
            : 'Creating dataset...',
          description: selectedDataset
            ? 'The selected spans are being added to the selected dataset. You will be notified by email when the dataset is ready.'
            : 'The selected spans are being added to a new dataset. You will be notified by email when the dataset is ready.',
        })
      }

      setSelectedDataset(undefined)
      setSelectedDocumentLogUuids([])
      setSelectedCount(0)
      setSelectionMode('NONE')
      selectableState.clearSelections()
      previewModalState.onClose()
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    },
  })
  const saveDataset = useCallback(
    async ({ name }: { name: string }) => {
      if (selectableState.selectionMode === 'NONE') return

      await createDatasetFromSpans({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        name,
        selectionMode: selectableState.selectionMode,
        selectedDocumentLogUuids,
        excludedDocumentLogUuids: Array.from(selectableState.excludedIds).map(
          String,
        ),
      })
    },
    [
      commit.uuid,
      createDatasetFromSpans,
      document.documentUuid,
      project.id,
      selectableState.excludedIds,
      selectableState.selectionMode,
      selectedDocumentLogUuids,
    ],
  )
  return useMemo(
    () => ({
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
      selectedCount,
      selectionMode,
    }),
    [
      previewData,
      onClickShowPreview,
      saveDataset,
      isLoading,
      previewModalState,
      setSelectedDataset,
      selectedDataset,
      isSaving,
      fetchPreview,
      error,
      selectedCount,
      selectionMode,
    ],
  )
}

export type PreviewConversationsState = ReturnType<
  typeof useSelectedConversations
>
