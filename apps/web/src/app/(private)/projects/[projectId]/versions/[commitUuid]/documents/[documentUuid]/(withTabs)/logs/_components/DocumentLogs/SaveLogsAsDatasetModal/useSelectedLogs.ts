import { createDatasetFromLogsAction } from '$/actions/datasets/createFromLogs'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { SelectableRowsHook } from '$/hooks/useSelectableRows'
import { useToggleModal } from '$/hooks/useToogleModal'
import { ROUTES } from '$/services/routes'
import {
  Dataset,
  DocumentLogFilterOptions,
  parseRowCell,
} from '@latitude-data/core/browser'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { DatasetRowData } from '@latitude-data/core/schema'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useCallback, useMemo, useState } from 'react'
import useSWR, { SWRConfiguration } from 'swr'

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

function serializeRowData(rowData: DatasetRowData): string[] {
  const keys = Object.keys(rowData)
  return keys.map((key) => {
    const cell = rowData[key]
    return parseRowCell({ cell })
  })
}

function serializeRows(item: InputItem): OutputItem {
  const columns = item.columns
  return {
    columns,
    datasetRows: item.existingRows.map(serializeRowData),
    previewRows: item.newRows.map(serializeRowData),
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
    documentLogIds,
  }: { dataset?: Dataset; documentLogIds: (string | number)[] },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher(ROUTES.api.datasets.previewLogs.root, {
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
  filterOptions,
}: {
  selectableState: SelectableRowsHook
  filterOptions: DocumentLogFilterOptions
}) {
  const { toast } = useToast()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const previewModalState = useToggleModal()
  const [selectedLogsIds, setSelectedLogsIds] = useState<(string | number)[]>(
    [],
  )
  const [selectedCount, setSelectedCount] = useState(0)
  const [selectedDataset, setSelectedDataset] = useState<Dataset>()
  const { previewData, fetchPreview, isLoading } = usePreviewRowsStore({
    dataset: selectedDataset,
    documentLogIds: selectedLogsIds,
  })
  const onClickShowPreview = useCallback(() => {
    previewModalState.onOpen()
    setSelectedLogsIds(selectableState.selectedRowIds)
    setSelectedCount(selectableState.selectedCount)
    fetchPreview()
  }, [
    previewModalState,
    fetchPreview,
    setSelectedLogsIds,
    selectableState.selectedRowIds,
    selectableState.selectedCount,
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
      previewModalState.onClose()
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
        selectionMode: selectableState.selectionMode,
        selectedDocumentLogIds: selectedLogsIds,
        excludedDocumentLogIds: Array.from(selectableState.excludedIds),
        filterOptions: filterOptions,
      })
    },
    [
      commit.uuid,
      createDatasetFromLogs,
      document.documentUuid,
      filterOptions,
      project.id,
      selectableState.excludedIds,
      selectableState.selectionMode,
      selectedLogsIds,
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
    ],
  )
}

export type PreviewLogsState = ReturnType<typeof useSelectedLogs>
