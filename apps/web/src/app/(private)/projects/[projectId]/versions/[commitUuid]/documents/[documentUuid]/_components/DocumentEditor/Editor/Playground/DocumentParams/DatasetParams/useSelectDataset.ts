import { useCallback, useMemo, useState } from 'react'

import {
  Inputs,
  Dataset,
  DocumentVersion,
  DatasetV2,
  InputSource,
  INPUT_SOURCE,
} from '@latitude-data/core/browser'
import {
  SelectOption,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import useDocumentVersions from '$/stores/documentVersions'
import {
  useVersionDatasetRows,
  useVersionedDatasets,
} from '$/hooks/useVersionedDatasets'

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
  source,
}: {
  document: DocumentVersion
  commitVersionUuid: string
  source: InputSource
}) {
  const [selectedDataset, setSelectedDataset] = useState<
    Dataset | DatasetV2 | undefined
  >()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { assignDataset } = useDocumentVersions()
  const isEnabled = source === INPUT_SOURCE
  const {
    data: datasets,
    isLoading: isLoadingDatasets,
    datasetVersion,
  } = useVersionedDatasets({
    enabled: isEnabled,
    onFetched: (data) => {
      setSelectedDataset(data.find((ds) => ds.id === document.datasetId))
    },
  })
  const {
    dataset: { inputs, mappedInputs, rowIndex, setDataset },
  } = useDocumentParameters({
    document,
    commitVersionUuid,
  })
  const datasetOptions = useMemo(
    () => datasets.map((ds) => ({ value: ds.id, label: ds.name })),
    [datasets],
  )
  const { data: rows, isLoading: isLoadingPreviewDataset } =
    useVersionDatasetRows({
      dataset: selectedDataset,
      rowIndex,
      enabled: isEnabled,
    })

  const datasetPreview = useMemo<DatasetPreview>(() => {
    if (!selectedDataset) return EMPTY_PREVIEW

    const headers = rows.headers
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
      rows: rows.rows,
      rowCount: rows.rowCount,
    }
    return preview
  }, [rows, selectedDataset])

  const onSelectDataset = useCallback(
    async (value: number) => {
      const ds = datasets.find((ds) => ds.id === Number(value))
      if (!ds) return

      console.log('DATASET_VERSION', datasetVersion)
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
      setDataset({
        datasetId: selectedDataset.id,
        datasetVersion,
        data: {
          rowIndex,
          inputs: newInputs,
          mappedInputs: mapped,
        },
      })
    },
    [
      inputs,
      setDataset,
      datasetPreview.rows,
      selectedDataset,
      mappedInputs,
      datasetVersion,
    ],
  )

  const onSelectHeader = useCallback(
    (param: string) => (headerIndex: number) => {
      if (!selectedDataset) return

      const prevMapped = mappedInputs ?? {}
      const mapped = { ...prevMapped, [param]: Number(headerIndex) }
      const newInputs = mappedToInputs({
        inputs,
        datasetPreview,
        mappedInputs: mapped,
        rowIndex: rowIndex ?? 0,
      })
      setDataset({
        datasetId: selectedDataset.id,
        datasetVersion,
        data: {
          inputs: newInputs,
          rowIndex: rowIndex ?? 0,
          mappedInputs: mapped,
        },
      })
    },
    [
      inputs,
      setDataset,
      rowIndex,
      datasetVersion,
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
    totalRows: datasetPreview.rowCount,
    onSelectHeader,
  }
}

export type UseSelectDataset = ReturnType<typeof useSelectDataset>
