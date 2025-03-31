import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import useDatasetPreview from '$/stores/datasetPreviews'
import {
  type Inputs,
  type Dataset,
  type DocumentVersion,
  DatasetVersion,
  LinkedDataset,
} from '@latitude-data/core/browser'
import { SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { useCallback, useMemo } from 'react'

type DatasetPreview = {
  headers: Record<number, string>
  rowCellOptions: SelectOption<number>[]
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
  rowCellOptions: [],
  rows: [],
  rowCount: 0,
}

// DEPRECATED: Legacy dataset v1. Remove
export function useDatasetV1RowsForParamaters({
  document,
  commitVersionUuid,
  dataset,
  enabled,
}: {
  document: DocumentVersion
  commitVersionUuid: string
  dataset?: Dataset
  enabled?: boolean
}) {
  const { data: rows, isLoading: isLoadingCsv } = useDatasetPreview({
    dataset: enabled ? dataset : undefined,
  })
  const { dataset: ds } = useDocumentParameters({
    document,
    commitVersionUuid,
    datasetVersion: DatasetVersion.V1,
  })
  const inputs = ds.inputs as LinkedDataset['inputs']
  const mappedInputs = ds.mappedInputs as LinkedDataset['mappedInputs']
  const rowIndex = ds.rowIndex
  const setDataset = ds.setDataset
  const onPrevPage = (page: number) => onRowChange(page - 1)
  const onNextPage = (page: number) => onRowChange(page + 1)
  const datasetPreview = useMemo<DatasetPreview>(() => {
    if (!dataset) return EMPTY_PREVIEW

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
      rowCellOptions: options,
      rows: rows.rows,
      rowCount: rows.rowCount,
    }
    return preview
  }, [rows, dataset])
  const onRowChange = useCallback(
    (rowIndex: number) => {
      if (!datasetPreview || !dataset) return

      const mapped = mappedInputs ?? {}
      const newInputs = mappedToInputs({
        inputs,
        datasetPreview,
        mappedInputs: mapped,
        rowIndex,
      })
      setDataset({
        datasetId: dataset.id,
        datasetVersion: DatasetVersion.V1,
        data: {
          rowIndex,
          inputs: newInputs,
          mappedInputs: mapped,
        },
      })
    },
    [enabled, inputs, setDataset, datasetPreview.rows, dataset, mappedInputs],
  )

  const onSelectRowCell = useCallback(
    (param: string) => (headerIndex: number) => {
      if (!dataset) return

      const prevMapped = mappedInputs ?? {}
      const mapped = { ...prevMapped, [param]: Number(headerIndex) }
      const newInputs = mappedToInputs({
        inputs,
        datasetPreview,
        mappedInputs: mapped,
        rowIndex: rowIndex ?? 0,
      })
      setDataset({
        datasetId: dataset.id,
        datasetVersion: DatasetVersion.V1,
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
      mappedInputs,
      datasetPreview?.rows,
      dataset?.id,
    ],
  )

  return {
    isLoading: isLoadingCsv,
    mappedInputs: mappedInputs ?? {},
    rowCellOptions: datasetPreview?.rowCellOptions ?? [],
    onSelectRowCell,
    position: rowIndex,
    count: datasetPreview?.rowCount ?? 0,
    onPrevPage,
    onNextPage,
  }
}
