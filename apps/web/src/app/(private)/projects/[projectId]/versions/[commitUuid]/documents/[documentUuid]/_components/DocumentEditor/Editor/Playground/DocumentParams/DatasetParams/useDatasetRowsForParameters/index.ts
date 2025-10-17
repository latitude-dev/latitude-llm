import { useCallback, useEffect, useMemo } from 'react'
import useDatasetRowsCount from '$/stores/datasetRowsCount'
import useDatasetRows from '$/stores/datasetRows'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { useMetadataParameters } from '$/hooks/useDocumentParameters/metadataParametersStore'
import { ClientDatasetRow } from '$/stores/datasetRows/rowSerializationHelpers'

import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'
import {
  Inputs,
  LinkedDatasetRow,
} from '@latitude-data/core/lib/documentPersistedInputs'
import { parseRowCell } from '@latitude-data/core/services/datasetRows/utils'

import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { DatasetRow } from '@latitude-data/core/schema/models/types/DatasetRow'
function mapDatasetColumnsToParameters({
  parameters,
  dataset,
}: {
  parameters: string[]
  dataset: Dataset
}) {
  return Object.fromEntries(
    dataset.columns
      .filter((col) => parameters.includes(col.name))
      .map((col) => [col.name, col.identifier]),
  )
}

function resolveDatasetDataRow({
  parameters,
  datasetRowId,
  localData,
  serverData,
  dataset,
  emptyInputs,
}: {
  parameters: string[]
  datasetRowId: number
  serverData: LinkedDatasetRow | undefined
  localData: LinkedDatasetRow | undefined
  dataset: Dataset
  emptyInputs: Inputs<'datasetV2'> | undefined
}): LinkedDatasetRow {
  let linkedDatasetRow: LinkedDatasetRow = {
    datasetRowId,
    inputs: {},
    mappedInputs: {},
  }
  const inputs = localData?.inputs ?? serverData?.inputs ?? emptyInputs ?? {}
  const mappedInputsFromDataset = mapDatasetColumnsToParameters({
    parameters,
    dataset,
  })

  return {
    ...linkedDatasetRow,
    inputs,
    mappedInputs: {
      ...mappedInputsFromDataset,
      ...(serverData?.mappedInputs ?? {}),
      ...(localData?.mappedInputs ?? {}),
    },
  }
}

function mapInputs({
  inputs,
  mappedInputs,
  row,
}: {
  inputs: Inputs<'datasetV2'>
  mappedInputs: Record<string, string>
  row: DatasetRow
}) {
  const mapped = Object.entries(mappedInputs).reduce((acc, [key, value]) => {
    const rawCell = row.rowData[value] ?? ''
    const cell = parseRowCell({ cell: rawCell })
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
  dataset: originalDataset,
  position,
  setPosition,
}: {
  position: number | undefined
  setPosition: ReactStateDispatch<number | undefined>
  document: DocumentVersion
  commitVersionUuid: string
  dataset: Dataset | null | undefined
}) {
  const emptyInputs = useMetadataParameters().emptyInputs?.datasetV2
  const dataset = useMemo(() => originalDataset, [originalDataset])
  const rowCellOptions = useMemo<SelectOption<string>[]>(
    () =>
      dataset?.columns.map((c) => ({ value: c.identifier, label: c.name })) ??
      [],
    [dataset],
  )
  const { data: count, isLoading: isLoadingDatasetRowsCount } =
    useDatasetRowsCount({ dataset })

  const { metadataParameters, datasetV2: ds } = useDocumentParameters({
    document,
    commitVersionUuid,
  })

  const onRowsFetched = useCallback(
    async (data: ClientDatasetRow[]) => {
      const row = data[0]
      if (!row || !dataset || !metadataParameters) return

      const localData = ds.assignedDatasets?.[row.datasetId]
      const serverData = document.linkedDatasetAndRow?.[row.datasetId]
      const resolvedData = resolveDatasetDataRow({
        parameters: metadataParameters,
        datasetRowId: row.id,
        localData,
        serverData,
        emptyInputs,
        dataset,
      })
      const inputs = mapInputs({
        inputs: resolvedData.inputs,
        mappedInputs: resolvedData.mappedInputs,
        row,
      })

      await ds.setDataset({
        datasetId: row.datasetId,
        data: {
          inputs,
          mappedInputs: resolvedData.mappedInputs,
          datasetRowId: row.id,
        },
      })
    },
    // FIXME: Fixing this dependency array declaration causes an infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      emptyInputs,
      ds.setDataset,
      ds.assignedDatasets,
      document.linkedDatasetAndRow,
      dataset?.id,
      metadataParameters,
    ],
  )

  const { data: datasetRows, isLoading: isLoadingRow } = useDatasetRows(
    {
      dataset: position === undefined ? undefined : dataset,
      page: position === undefined ? undefined : String(position),
      pageSize: '1', // Paginatinate one by one in document parameters
    },
    {
      keepPreviousData: true,
      revalidateIfStale: false,
    },
  )

  const datasetRow = datasetRows?.[0]
  const updatePosition = useCallback(
    (position: number) => {
      if (isLoadingRow) return

      setPosition(position)
    },
    // FIXME: Fixing this dependency array declaration causes an infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const inputs = mapInputs({
        inputs: ds.inputs,
        mappedInputs: mapped,
        row: datasetRow,
      })
      ds.setDataset({
        datasetId: dataset.id,
        data: {
          datasetRowId: datasetRow.id,
          inputs,
          mappedInputs: mapped,
        },
      })
    },
    // FIXME: Fixing this dependency array declaration causes an infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ds.setDataset, ds.inputs, ds.mappedInputs, dataset?.id, datasetRow],
  )

  useEffect(() => {
    // React to fresh fetched rows
    onRowsFetched(datasetRows ?? [])
    // FIXME: Fixing this dependency array declaration causes an infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetRows])

  return {
    isLoading: isLoadingDatasetRowsCount || isLoadingRow,
    loadingState: {
      rows: isLoadingRow,
      count: isLoadingDatasetRowsCount,
    },
    rowCellOptions,
    onSelectRowCell,
    position,
    count: count ?? 0,
    onNextPage,
    onPrevPage,
  }
}
