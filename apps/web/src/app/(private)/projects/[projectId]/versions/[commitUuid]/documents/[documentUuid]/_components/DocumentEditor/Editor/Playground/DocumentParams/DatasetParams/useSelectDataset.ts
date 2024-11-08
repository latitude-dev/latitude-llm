import { useCallback, useMemo, useState } from 'react'

import { Dataset } from '@latitude-data/core/browser'
import {
  SelectOption,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import {
  PlaygroundInput,
  PlaygroundInputs,
} from '$/hooks/useDocumentParameters'
import useDatasetPreview from '$/stores/datasetPreviews'
import useDatasets from '$/stores/datasets'
import useDocumentVersions from '$/stores/documentVersions'

import { useSelectedDatasetRow } from './useSelectedRow'

export type DatasetPreview = {
  headers: Record<number, string>
  headersOptions: SelectOption[]
  rows: string[][]
  rowCount: number
}
function mappedToInputs({
  inputs,
  datasetPreview,
  mappedInputs,
  rowIndex,
}: {
  inputs: PlaygroundInputs
  datasetPreview: DatasetPreview
  mappedInputs: Record<string, number>
  rowIndex: number
}) {
  const rows = datasetPreview.rows
  const row = rows[rowIndex] ?? []
  const cleanRow = row.slice(1)
  const mapped = Object.entries(mappedInputs).reduce(
    (acc, [key, value]) => {
      const cell = cleanRow[value] ?? ''
      acc[key] = {
        value: cell,
        includedInPrompt: true,
      }
      return acc
    },
    {} as { [key: string]: PlaygroundInput },
  )

  // Recalculate inputs
  return Object.entries(inputs).reduce((acc, [key, value]) => {
    const newInput = mapped[key]
    acc[key] = newInput ?? value // If not found let existing
    return acc
  }, {} as PlaygroundInputs)
}

export function useSelectDataset({
  inputs,
  setInputs,
}: {
  inputs: PlaygroundInputs
  setInputs: (newInputs: PlaygroundInputs) => void
}) {
  const document = useCurrentDocument()
  const [selectedDataset, setSelectedDataset] = useState<Dataset | undefined>()
  const { data: datasets, isLoading: isLoadingDatasets } = useDatasets({
    onFetched: (data) => {
      setSelectedDataset(data.find((ds) => ds.id === document.datasetId))
    },
  })
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { assignDataset } = useDocumentVersions()
  const datasetOptions = useMemo(
    () => datasets.map((ds) => ({ value: ds.id, label: ds.name })),
    [datasets],
  )
  const { selectedRow, saveRowInfo } = useSelectedDatasetRow({
    document,
    dataset: selectedDataset,
  })

  const [datasetPreview, setDatasetPreview] = useState<DatasetPreview>({
    headers: {},
    headersOptions: [],
    rows: [],
    rowCount: 0,
  })
  const { isLoading: isLoadingPreviewDataset } = useDatasetPreview({
    dataset: selectedDataset,
    onSuccess: (csv) => {
      const headers = csv?.headers ?? []
      const headersByIndex = headers.reduce(
        (acc, header, i) => {
          acc[i] = header
          return acc
        },
        {} as DatasetPreview['headers'],
      )
      const options = headers.map((header, i) => ({ value: i, label: header }))
      const preview = {
        headers: headersByIndex,
        headersOptions: options,
        rows: csv?.rows ?? [],
        rowCount: csv?.rowCount ?? 0,
      }
      if (!selectedDataset) return

      setDatasetPreview(preview)
    },
  })
  const onSelectDataset = useCallback(
    async (value: string) => {
      const ds = datasets.find((ds) => ds.id === Number(value))
      if (!ds) return

      await assignDataset({
        projectId: project.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        datasetId: ds.id,
      })

      setSelectedDataset(ds)
      saveRowInfo({ rowIndex: 0, datasetId: ds.id, mappedInputs: {} })
    },
    [
      datasets,
      assignDataset,
      project.id,
      document.documentUuid,
      commit.uuid,
      saveRowInfo,
    ],
  )
  const isLoading = isLoadingDatasets || isLoadingPreviewDataset

  const onRowChange = useCallback(
    (rowIndex: number) => {
      if (!datasetPreview || !selectedDataset) return

      const mapped = selectedRow?.mappedInputs ?? {}
      const newInputs = mappedToInputs({
        inputs,
        datasetPreview,
        mappedInputs: mapped,
        rowIndex,
      })
      setInputs(newInputs)
      saveRowInfo({
        rowIndex,
        datasetId: selectedDataset.id,
        mappedInputs: mapped,
      })
    },
    [
      inputs,
      setInputs,
      saveRowInfo,
      datasetPreview.rows,
      selectedDataset,
      selectedRow?.mappedInputs,
    ],
  )

  const onSelectHeader = useCallback(
    (param: string) => (headerIndex: string) => {
      const prevMapped = selectedRow?.mappedInputs ?? {}
      const mapped = { ...prevMapped, [param]: Number(headerIndex) }
      const newInputs = mappedToInputs({
        inputs,
        datasetPreview,
        mappedInputs: mapped,
        rowIndex: selectedRow?.rowIndex ?? 0,
      })
      saveRowInfo({
        rowIndex: selectedRow?.rowIndex ?? 0,
        datasetId: selectedDataset?.id,
        mappedInputs: mapped,
      })
      setInputs(newInputs)
    },
    [
      inputs,
      setInputs,
      saveRowInfo,
      selectedRow?.rowIndex,
      selectedRow?.mappedInputs,
      datasetPreview?.rows,
      selectedDataset?.id,
    ],
  )

  return {
    selectedRow: {
      rowIndex: selectedRow?.rowIndex ?? 0,
      mappedInputs: selectedRow?.mappedInputs ?? {},
    },
    datasetPreview,
    isLoading,
    datasetOptions,
    selectedDataset,
    onSelectDataset,
    onRowChange,
    selectedRowIndex: selectedRow?.rowIndex,
    totalRows: datasetPreview?.rowCount,
    onSelectHeader,
  }
}

export type UseSelectDataset = ReturnType<typeof useSelectDataset>
