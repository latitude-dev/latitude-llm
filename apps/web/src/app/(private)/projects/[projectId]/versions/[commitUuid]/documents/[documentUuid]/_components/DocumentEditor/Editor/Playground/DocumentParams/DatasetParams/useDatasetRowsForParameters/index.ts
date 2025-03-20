import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useDatasetRowsCount from '$/stores/datasetRowsCount'
import useDatasetRows from '$/stores/datasetRows'
import {
  DatasetV2,
  DatasetVersion,
  DocumentVersion,
} from '@latitude-data/core/browser'
import {
  useDatasetRowWithPosition,
  type WithPositionData,
} from './useDatasetRowsWithPosition'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { SelectOption } from '@latitude-data/web-ui'
import { ConversationMetadata } from 'promptl-ai'
import { type DatasetRowDataContent } from '@latitude-data/core/schema'
import { parseRowCell } from '$/stores/datasetRows/rowSerializationHelpers'

export type DatasetMappedValue = {
  param: string
  value: DatasetRowDataContent | undefined
  columnIdentifier: string | undefined
  isMapped: boolean
  isEmpty: boolean
}

function getInitialPosition(
  selectedDatasetRowId: number | undefined,
): WithPositionData | undefined {
  return selectedDatasetRowId ? undefined : { position: 1, page: 1 }
}

function getDocumentMappedInputs({
  document,
  dataset,
}: {
  document: DocumentVersion
  dataset: DatasetV2 | null | undefined
}) {
  if (!dataset) return {}
  if (!document.linkedDatasetAndRow) return {}

  return document.linkedDatasetAndRow[dataset.id]?.mappedInputs ?? {}
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
  enabled,
  metadata,
  datasetIsReady,
}: {
  document: DocumentVersion
  commitVersionUuid: string
  dataset: DatasetV2 | null | undefined
  enabled?: boolean
  metadata: ConversationMetadata | undefined
  datasetIsReady: boolean
}) {
  const hasInitialized = useRef(false)
  const datasetIdRef = useRef(dataset?.id)
  const [fetchedPosition, setFetchedPosition] = useState(false)
  const rowCellOptions = useMemo<SelectOption<string>[]>(
    () =>
      dataset?.columns.map((c) => ({ value: c.identifier, label: c.name })) ??
      [],
    [dataset],
  )
  const { data: count, isLoading: isLoadingDatasetRowsCount } =
    useDatasetRowsCount({
      dataset: enabled && dataset ? dataset : undefined,
    })

  const {
    onParametersChange,
    setParametersLoading,
    datasetV2: { setDataset, datasetRowId },
  } = useDocumentParameters({
    document,
    commitVersionUuid,
    datasetVersion: DatasetVersion.V2,
  })
  const [selectedDatasetRowId, setSelectedDatasetRowId] = useState<
    number | undefined
  >(datasetRowId)

  const [position, setPosition] = useState<WithPositionData | undefined>(
    getInitialPosition(selectedDatasetRowId),
  )

  const resetPosition = useCallback((datasetId: number | undefined) => {
    datasetIdRef.current = datasetId
    setFetchedPosition(false)
    setPosition(getInitialPosition(undefined))
    setSelectedDatasetRowId(undefined)
  }, [])

  useEffect(() => {
    // Important useEffect
    // Takes care of reseting the state of the hook when the dataset changes
    if (!datasetIsReady) return

    const currentId = dataset?.id
    const previousId = datasetIdRef.current

    // First run → set the ref but don't reset
    if (!hasInitialized.current) {
      datasetIdRef.current = currentId
      hasInitialized.current = true
      return
    }

    // If it changed (even from undefined), reset
    if (currentId !== previousId) {
      resetPosition(currentId)
    }
  }, [datasetIsReady, dataset?.id, resetPosition])

  const onFetchPosition = useCallback(
    (data: WithPositionData) => {
      setFetchedPosition(true)
      setPosition(data)
    },
    [selectedDatasetRowId, document.datasetV2Id],
  )

  const { isLoading: isLoadingPosition } = useDatasetRowWithPosition({
    dataset: enabled && !!dataset ? dataset : undefined,
    enabled:
      !fetchedPosition && !!selectedDatasetRowId && selectedDatasetRowId > 0,
    datasetRowId: selectedDatasetRowId,
    onFetched: onFetchPosition,
  })

  const { data: datasetRows, isLoading: isLoadingRow } = useDatasetRows({
    dataset: position && dataset ? (dataset as DatasetV2) : undefined,
    page: String(position?.position),
    pageSize: '1', // Paginatinate one by one in document parameters
    onFetched: async (data) => {
      const row = data[0]
      if (!row || !dataset) return

      await setDataset({
        datasetId: dataset.id,
        datasetVersion: DatasetVersion.V2,
        data: {
          datasetRowId: row.id,
        },
      })
      setSelectedDatasetRowId(row.id)
    },
  })
  const datasetRow = datasetRows?.[0]
  const updatePosition = useCallback(
    (position: number) => {
      if (isLoadingRow) return

      setPosition((prev) => {
        return prev ? { ...prev, position } : { position, page: 1 }
      })
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

  const mappedInputs = useMemo(
    () => getDocumentMappedInputs({ document, dataset }),
    [document, dataset],
  )
  const onSelectRowCell = useCallback(
    (param: string) => (columnIdentifier: string) => {
      if (!dataset || !datasetRow) return

      const prevMapped = mappedInputs ?? {}
      const mapped = { ...prevMapped, [param]: columnIdentifier }
      setParametersLoading()
      setDataset({
        datasetId: dataset.id,
        datasetVersion: DatasetVersion.V2,
        data: {
          datasetRowId: datasetRow.id,
          mappedInputs: mapped,
        },
      })
    },
    [setParametersLoading, setDataset, mappedInputs, dataset?.id, datasetRow],
  )

  const colsByName = useMemo(() => {
    const cols = dataset?.columns ?? []
    return cols.reduce((map, col) => {
      map.set(col.name, col.identifier)
      return map
    }, new Map<string, string>())
  }, [dataset?.columns])

  const isLoading =
    isLoadingRow || isLoadingDatasetRowsCount || isLoadingPosition
  const parametersReady = !!metadata && !isLoading && !!datasetRow
  const parameters = useMemo<DatasetMappedValue[]>(() => {
    if (!parametersReady) return []

    return Array.from(metadata.parameters).map((param) => {
      const cells = datasetRow.rowData
      const columnIdentifier = mappedInputs[param] ?? colsByName.get(param)
      const rawValue = columnIdentifier ? cells[columnIdentifier] : undefined
      const value = parseRowCell({ cell: rawValue, parseDates: false })
      const isEmpty = value === ''
      return {
        param,
        value,
        isEmpty,
        columnIdentifier,
        isMapped: !!columnIdentifier,
      }
    })
  }, [
    metadata,
    onParametersChange,
    mappedInputs,
    parametersReady,
    datasetRow,
    colsByName,
  ])

  useEffect(() => {
    if (!parametersReady) return

    const mappedValues = parameters.reduce(
      (acc, { param, value }) => {
        acc[param] = String(value)
        return acc
      },
      {} as Record<string, string>,
    )
    onParametersChange(mappedValues)
  }, [parameters])

  return {
    isLoading,
    mappedInputs: mappedInputs ?? {},
    parameters,
    rowCellOptions,
    onSelectRowCell,
    position: position?.position,
    count: count ?? 0,
    onNextPage,
    onPrevPage,
  }
}
