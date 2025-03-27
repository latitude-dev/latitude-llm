import { useCallback, useMemo, useRef, useState } from 'react'
import useDatasetRowsCount from '$/stores/datasetRowsCount'
import useDatasetRows from '$/stores/datasetRows'
import {
  DatasetRow,
  DatasetV2,
  DatasetVersion,
  DocumentVersion,
  Inputs,
} from '@latitude-data/core/browser'
import {
  useDatasetRowWithPosition,
  type WithPositionData,
} from './useDatasetRowsWithPosition'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { SelectOption } from '@latitude-data/web-ui'
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

function usePositionPerDataset(datasetId: number | undefined) {
  const [positions, setPositions] = useState(
    () => new Map<number, WithPositionData>(),
  )
  const current = datasetId
    ? (positions.get(datasetId) ?? { position: 1, page: 1 })
    : undefined

  const update = (newPosition: WithPositionData) => {
    if (!datasetId) return

    setPositions((prev) => {
      const next = new Map(prev)
      next.set(datasetId, newPosition)
      return next
    })
  }

  return { position: current, setPosition: update }
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
}: {
  document: DocumentVersion
  commitVersionUuid: string
  dataset: DatasetV2 | null | undefined
}) {
  const { position, setPosition } = usePositionPerDataset(dataset?.id)
  const lastRowIdRef = useRef(new Map<number | undefined, number | undefined>())
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

  const onFetchPosition = useCallback(
    (data: WithPositionData) => {
      setPosition(data)
    },
    [setPosition],
  )

  const { isLoading: isLoadingPosition } = useDatasetRowWithPosition({
    dataset,
    datasetRowId: ds.datasetRowId,
    onFetched: onFetchPosition,
  })

  const { data: datasetRows, isLoading: isLoadingRow } = useDatasetRows({
    dataset: position === undefined ? undefined : dataset,
    page: position === undefined ? undefined : String(position.position),
    pageSize: '1', // Paginatinate one by one in document parameters
    onFetched: async (data) => {
      const row = data[0]
      if (!row || !dataset) return

      const lastRowId = lastRowIdRef.current.get(dataset.id)
      if (lastRowId === ds.datasetRowId) return

      lastRowIdRef.current.set(dataset.id, ds.datasetRowId)

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

      setPosition({ position, page: 1 })
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

  const isLoading =
    isLoadingRow || isLoadingDatasetRowsCount || isLoadingPosition

  return {
    isLoading,
    rowCellOptions,
    onSelectRowCell,
    position: position?.position,
    count: count ?? 0,
    onNextPage,
    onPrevPage,
  }
}
