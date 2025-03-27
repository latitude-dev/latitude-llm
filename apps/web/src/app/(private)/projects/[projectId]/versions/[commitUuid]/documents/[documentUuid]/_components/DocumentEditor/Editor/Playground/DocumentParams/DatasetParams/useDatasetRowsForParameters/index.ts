import { useCallback, useMemo } from 'react'
import useDatasetRowsCount from '$/stores/datasetRowsCount'
import useDatasetRows from '$/stores/datasetRows'
import {
  DatasetRow,
  DatasetV2,
  DatasetVersion,
  DocumentVersion,
  Inputs,
} from '@latitude-data/core/browser'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { ReactStateDispatch, SelectOption } from '@latitude-data/web-ui'
import { parseRowCell } from '$/stores/datasetRows/rowSerializationHelpers'

function mappedToInputs({
  inputs,
  mappedInputs,
  row,
}: {
  row: DatasetRow
  inputs: Inputs<'datasetV2'>
  mappedInputs: Record<string, string>
}) {
  const mapped = Object.entries(mappedInputs).reduce((acc, [key, value]) => {
    const rawCell = row.rowData[value] ?? ''
    const cell = parseRowCell({ cell: rawCell, parseDates: false })
    acc[key] = {
      value: cell,
      metadata: {
        includeInPrompt: true,
      },
    }
    return acc
  }, {} as Inputs<'datasetV2'>)

  return Object.entries(inputs).reduce((acc, [key, value]) => {
    const newInput = mapped[key]
    const newValue = newInput ? newInput : value
    acc[key] = newValue
    return acc
  }, {} as Inputs<'datasetV2'>)
}

/**
 * This hook is responsible of fetching the dataset rows and the
 * total amount of dataset rows for a dataset (v2).
 * This way we can paginate in document parameters all the rows
 */
export function useDatasetRowsForParameters({
  document,
  commitVersionUuid,
  dataset,
  position,
  setPosition,
}: {
  position: number | undefined
  setPosition: ReactStateDispatch<number | undefined>
  document: DocumentVersion
  commitVersionUuid: string
  dataset: DatasetV2 | null | undefined
}) {
  const rowCellOptions = useMemo<SelectOption<string>[]>(
    () =>
      dataset?.columns.map((c) => ({ value: c.identifier, label: c.name })) ??
      [],
    [dataset],
  )
  const { data: count, isLoading: isLoadingDatasetRowsCount } =
    useDatasetRowsCount({ dataset })

  const { datasetV2: ds } = useDocumentParameters({
    document,
    commitVersionUuid,
    datasetVersion: DatasetVersion.V2,
  })

  const { data: datasetRows, isLoading: isLoadingRow } = useDatasetRows({
    dataset: position === undefined ? undefined : dataset,
    page: position === undefined ? undefined : String(position),
    pageSize: '1', // Paginatinate one by one in document parameters
    onFetched: async (data) => {
      const row = data[0]
      if (!row || !dataset) return

      const inputs = mappedToInputs({
        inputs: ds.inputs,
        mappedInputs: ds.mappedInputs,
        row,
      })
      await ds.setDataset({
        datasetId: dataset.id,
        datasetVersion: DatasetVersion.V2,
        data: {
          inputs,
          mappedInputs: ds.mappedInputs,
          datasetRowId: row.id,
        },
      })
    },
  })

  const datasetRow = datasetRows?.[0]
  const updatePosition = useCallback(
    (position: number) => {
      if (isLoadingRow) return

      setPosition(position)
    },
    [isLoadingRow],
  )

  const onNextPage = useCallback(
    (position: number) => updatePosition(position + 1),
    [updatePosition],
  )

  const onPrevPage = useCallback(
    (position: number) => updatePosition(position - 1),
    [updatePosition],
  )

  const onSelectRowCell = useCallback(
    (param: string) => (columnIdentifier: string) => {
      if (!dataset || !datasetRow) return

      const prevMapped = ds.mappedInputs ?? {}
      const mapped = { ...prevMapped, [param]: columnIdentifier }
      const inputs = mappedToInputs({
        inputs: ds.inputs,
        mappedInputs: mapped,
        row: datasetRow,
      })
      ds.setDataset({
        datasetId: dataset.id,
        datasetVersion: DatasetVersion.V2,
        data: {
          datasetRowId: datasetRow.id,
          inputs,
          mappedInputs: mapped,
        },
      })
    },
    [ds.setDataset, ds.inputs, ds.mappedInputs, dataset?.id, datasetRow],
  )

  const isLoading = isLoadingRow || isLoadingDatasetRowsCount

  return {
    isLoading,
    rowCellOptions,
    onSelectRowCell,
    position,
    count: count ?? 0,
    onNextPage,
    onPrevPage,
  }
}
