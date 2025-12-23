import { ParametersPaginationNav } from '$/components/ParametersPaginationNav'
import { ROUTES } from '$/services/routes'
import useDatasetRows from '$/stores/datasetRows'
import useDatasetRowsCount from '$/stores/datasetRowsCount'
import useDatasets from '$/stores/datasets'
import { INPUT_SOURCE } from '@latitude-data/core/lib/documentPersistedInputs'
import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Select, SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDocumentParameterValues } from '../DocumentParametersContext'
import { NoInputsMessage } from '../NoInputsMessage'
import { useDatasetRowPosition } from './useRowPosition'

function BlankSlate() {
  return (
    <Link
      href={ROUTES.datasets.root()}
      className='flex flex-row items-center gap-1'
    >
      <Button iconProps={{ name: 'externalLink' }} variant='link'>
        Manage datasets
      </Button>
    </Link>
  )
}

export function DatasetParams({
  document,
  metadataParameters,
}: {
  document: DocumentVersion
  metadataParameters: string[]
}) {
  const { setParameterValues } = useDocumentParameterValues()
  const { getPosition, position, setPosition, isLoadingPosition } =
    useDatasetRowPosition()

  // Dataset selection
  const [selectedDataset, setSelectedDataset] = useState<Dataset | undefined>()
  const { data: datasets, isLoading: isLoadingDatasets } = useDatasets({
    page: '1',
    pageSize: '10000', // No pagination
    onFetched: (data) => {
      const selectedDs = data.find((ds) => ds.id === document.datasetV2Id)
      if (selectedDs) {
        setSelectedDataset(selectedDs)
      }
    },
  })

  const datasetOptions = useMemo<SelectOption<number>[]>(
    () => datasets.map((ds) => ({ value: ds.id, label: ds.name })),
    [datasets],
  )

  const rowCellOptions = useMemo(
    () =>
      selectedDataset?.columns.map((c) => ({
        value: c.identifier,
        label: c.name,
      })) ?? [],
    [selectedDataset],
  )

  // Dataset rows and pagination
  const { data: count } = useDatasetRowsCount({
    dataset: selectedDataset,
  })

  const { data: datasetRows, isLoading: isLoadingRows } = useDatasetRows(
    {
      dataset: position === undefined ? undefined : selectedDataset,
      page: position === undefined ? undefined : String(position),
      pageSize: '1',
    },
    {
      keepPreviousData: true,
      revalidateIfStale: false,
    },
  )

  const currentRow = useMemo(
    () => (datasetRows?.length ? datasetRows[0] : undefined),
    [datasetRows],
  )

  const updatePosition = useCallback(
    (newPosition: number) => {
      if (isLoadingRows) return
      setPosition(newPosition)
    },
    [isLoadingRows, setPosition],
  )

  const onNextPage = useCallback(
    (currentPosition: number) => updatePosition(currentPosition + 1),
    [updatePosition],
  )

  const onPrevPage = useCallback(
    (currentPosition: number) => updatePosition(currentPosition - 1),
    [updatePosition],
  )

  // Column mapping
  const [mappedValues, setMappedValues] = useState<Record<string, string>>({})

  const onSelectRowCell = useCallback(
    (param: string) => (columnIdentifier: string | undefined) => {
      if (!columnIdentifier) {
        setMappedValues((prev) => {
          const updated = { ...prev }
          delete updated[param]
          return updated
        })
        return
      }

      setMappedValues((prev) => ({
        ...prev,
        [param]: columnIdentifier,
      }))
    },
    [],
  )

  // Dataset selection handler
  const onSelectDataset = async (value: number) => {
    const ds = datasets.find((ds) => ds.id === Number(value))
    if (ds) {
      setSelectedDataset(ds)
      await getPosition({
        dataset: ds,
        datasetRowId: document.linkedDatasetAndRow?.[ds.id]?.datasetRowId,
      })
    }
  }

  // Initialize position when document loads with a dataset
  useEffect(() => {
    if (selectedDataset && document.datasetV2Id === selectedDataset.id) {
      getPosition({
        dataset: selectedDataset,
        datasetRowId:
          document.linkedDatasetAndRow?.[selectedDataset.id]?.datasetRowId,
      })
    }
  }, [
    document.datasetV2Id,
    selectedDataset,
    document.linkedDatasetAndRow,
    getPosition,
  ])

  const selectedId = selectedDataset?.id
  const isLoading = isLoadingDatasets || isLoadingPosition

  // Sync parameter values from dataset row
  useEffect(() => {
    if (!currentRow) return

    const paramValues: Record<string, string> = {}
    metadataParameters.forEach((param) => {
      const columnIdentifier = mappedValues?.[param]
      if (columnIdentifier) {
        const value = currentRow.processedRowData?.[columnIdentifier]
        paramValues[param] =
          value !== undefined && value !== null && value !== '' ? value : ''
      }
    })

    setParameterValues(INPUT_SOURCE.dataset, paramValues)
  }, [currentRow, mappedValues, metadataParameters, setParameterValues])

  return (
    <div className='flex flex-col gap-y-4'>
      <div className='flex flex-row items-center justify-between gap-x-4 border-b border-border pb-4'>
        <Select
          width='auto'
          name='datasetId'
          placeholder='Select dataset'
          loading={isLoadingDatasets}
          disabled={isLoadingDatasets || !datasetOptions.length}
          options={datasetOptions}
          onChange={onSelectDataset}
          value={selectedId}
          searchable
        />
        <div className='min-w-0'>
          {isLoading ? (
            <Skeleton height='h5' className='w-40 min-w-0' />
          ) : (
            <>
              {selectedDataset && position !== undefined ? (
                <ParametersPaginationNav
                  currentIndex={position}
                  totalCount={count}
                  onPrevPage={() => onPrevPage(position ?? 1)}
                  onNextPage={() => onNextPage(position ?? 1)}
                  disabled={isLoadingPosition || isLoadingRows}
                  label='rows in dataset'
                />
              ) : (
                <BlankSlate />
              )}
            </>
          )}
        </div>
      </div>
      <div className='flex flex-col gap-3'>
        {metadataParameters.length > 0 ? (
          <div className='grid grid-cols-[auto_1fr] gap-y-3'>
            {metadataParameters.map((param) => {
              const columnIdentifier = mappedValues?.[param]
              const cellValue =
                currentRow && columnIdentifier
                  ? String(
                      currentRow.processedRowData?.[columnIdentifier] ??
                        'Empty',
                    )
                  : 'Empty'
              const isMapped = columnIdentifier !== undefined

              return (
                <div
                  key={param}
                  className='grid col-span-2 grid-cols-subgrid gap-3 w-full items-start'
                >
                  <div className='flex flex-row items-center gap-x-2 min-h-8'>
                    <Badge variant={isMapped ? 'accent' : 'muted'}>
                      &#123;&#123;{param}&#125;&#125;
                    </Badge>
                  </div>
                  <div className='flex flex-grow min-w-0 items-start w-full'>
                    <div className='flex flex-col flex-grow min-w-0 gap-y-1'>
                      <Select<string>
                        name={param}
                        placeholder='Choose row header'
                        options={rowCellOptions as SelectOption<string>[]}
                        disabled={isLoadingRows || rowCellOptions.length === 0}
                        onChange={onSelectRowCell(param)}
                        value={mappedValues?.[param]}
                      />
                      <div className='flex flex-row items-center gap-x-2 flex-grow min-w-0'>
                        <Text.H6 color='foregroundMuted' ellipsis noWrap>
                          {isLoadingRows ? 'Loading...' : cellValue}
                        </Text.H6>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <NoInputsMessage />
        )}
      </div>
    </div>
  )
}
