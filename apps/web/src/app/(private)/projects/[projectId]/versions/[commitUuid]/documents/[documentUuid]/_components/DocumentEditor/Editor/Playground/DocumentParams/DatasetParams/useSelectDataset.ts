import { useCallback, useMemo, useState } from 'react'

import { Inputs, Dataset, DocumentVersion } from '@latitude-data/core/browser'
import {
  SelectOption,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import useDatasetPreview from '$/stores/datasetPreviews'
import useDatasets from '$/stores/datasets'
import useDocumentVersions from '$/stores/documentVersions'

export type DatasetPreview = {
  headers: Record<number, string>
  headersOptions: SelectOption<number>[]
  rows: string[][]
  rowCount: number
}
function mappedToInputs({
  inputs,
  datasetPreview,
  mappedInputs,
  rowIndex,
}: {
  inputs: Inputs<'dataset'>
  datasetPreview: DatasetPreview
  mappedInputs: Record<string, number>
  rowIndex: number
}) {
  const rows = datasetPreview.rows
  const row = rows[rowIndex] ?? []
  const cleanRow = row.slice(1)
  const mapped = Object.entries(mappedInputs).reduce((acc, [key, value]) => {
    const cell = cleanRow[value] ?? ''
    acc[key] = {
      value: cell,
      metadata: {
        includeInPrompt: true,
      },
    }
    return acc
  }, {} as Inputs<'dataset'>)

  // Recalculate inputs
  return Object.entries(inputs).reduce((acc, [key, value]) => {
    const newInput = mapped[key]
    acc[key] = newInput ?? value // If not found let existing
    return acc
  }, {} as Inputs<'dataset'>)
}
const EMPTY_PREVIEW = {
  headers: {},
  headersOptions: [],
  rows: [],
  rowCount: 0,
}

export function useSelectDataset({
  document,
  commitVersionUuid,
}: {
  document: DocumentVersion
  commitVersionUuid: string
}) {
  const [selectedDataset, setSelectedDataset] = useState<Dataset | undefined>()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { assignDataset } = useDocumentVersions()
  const { data: datasets, isLoading: isLoadingDatasets } = useDatasets({
    onFetched: (data) => {
      setSelectedDataset(data.find((ds) => ds.id === document.datasetId))
    },
  })
  const {
    dataset: { inputs, mappedInputs, rowIndex, setInputs, setDataset },
  } = useDocumentParameters({
    documentVersionUuid: document.documentUuid,
    commitVersionUuid,
  })
  const datasetOptions = useMemo(
    () => datasets.map((ds) => ({ value: ds.id, label: ds.name })),
    [datasets],
  )
  const { data: csv, isLoading: isLoadingPreviewDataset } = useDatasetPreview({
    dataset: selectedDataset,
  })

  const datasetPreview = useMemo<DatasetPreview>(() => {
    if (!selectedDataset) return EMPTY_PREVIEW

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
    return preview
  }, [csv, selectedDataset])

  const onSelectDataset = useCallback(
    async (value: number) => {
      const ds = datasets.find((ds) => ds.id === Number(value))
      if (!ds) return

      await assignDataset({
        projectId: project.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        datasetId: ds.id,
      })

      setSelectedDataset(ds)
      setDataset({ rowIndex: 0, datasetId: ds.id, mappedInputs: {} })
    },
    [
      datasets,
      assignDataset,
      project.id,
      document.documentUuid,
      commit.uuid,
      setDataset,
    ],
  )
  const isLoading = isLoadingDatasets || isLoadingPreviewDataset

  const onRowChange = useCallback(
    (rowIndex: number) => {
      if (!datasetPreview || !selectedDataset) return

      const mapped = mappedInputs ?? {}
      const newInputs = mappedToInputs({
        inputs,
        datasetPreview,
        mappedInputs: mapped,
        rowIndex,
      })
      setInputs(newInputs)
      setDataset({
        rowIndex,
        datasetId: selectedDataset.id,
        mappedInputs: mapped,
      })
    },
    [
      inputs,
      setInputs,
      setDataset,
      datasetPreview.rows,
      selectedDataset,
      mappedInputs,
    ],
  )

  const onSelectHeader = useCallback(
    (param: string) => (headerIndex: number) => {
      const prevMapped = mappedInputs ?? {}
      const mapped = { ...prevMapped, [param]: Number(headerIndex) }
      const newInputs = mappedToInputs({
        inputs,
        datasetPreview,
        mappedInputs: mapped,
        rowIndex: rowIndex ?? 0,
      })
      setDataset({
        rowIndex: rowIndex ?? 0,
        datasetId: selectedDataset?.id,
        mappedInputs: mapped,
      })
      setInputs(newInputs)
    },
    [
      inputs,
      setInputs,
      setDataset,
      rowIndex,
      mappedInputs,
      datasetPreview?.rows,
      selectedDataset?.id,
    ],
  )

  return {
    selectedRow: {
      rowIndex: rowIndex ?? 0,
      mappedInputs: mappedInputs ?? {},
    },
    datasetPreview,
    isLoading,
    datasetOptions,
    selectedDataset,
    onSelectDataset,
    onRowChange,
    selectedRowIndex: rowIndex,
    totalRows: datasetPreview?.rowCount,
    onSelectHeader,
  }
}

export type UseSelectDataset = ReturnType<typeof useSelectDataset>
