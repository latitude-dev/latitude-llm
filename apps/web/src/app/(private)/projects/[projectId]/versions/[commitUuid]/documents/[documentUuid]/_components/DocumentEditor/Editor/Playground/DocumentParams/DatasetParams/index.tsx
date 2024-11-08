import {
  Button,
  cn,
  ReactStateDispatch,
  Select,
  Text,
} from '@latitude-data/web-ui'
import { PlaygroundInputs } from '$/hooks/useDocumentParameters'

import { ParamsSource } from '../index'
import { InputMapper } from './InputsMapper'
import { type UseSelectDataset } from './useSelectDataset'

const INDEX_ZERO_LIST = 1
function DatasetRowsPagination({
  currentIndex,
  totalCount,
  onRowChange,
}: {
  currentIndex: number | undefined
  totalCount: number | undefined
  onRowChange: (index: number) => void
}) {
  if (currentIndex === undefined || totalCount === undefined) return null

  return (
    <div className='flex items-center'>
      <Button
        size='default'
        variant='ghost'
        disabled={currentIndex <= 0}
        iconProps={{
          name: 'chevronLeft',
        }}
        onClick={() => onRowChange(currentIndex - 1)}
      />
      <div className='flex flex-row items-center gap-x-1'>
        <Text.H5M color='foregroundMuted'>
          {currentIndex + INDEX_ZERO_LIST}
        </Text.H5M>
        <div className='max-w-14' />
        <Text.H5M color='foregroundMuted'>
          of {totalCount} rows in dataset
        </Text.H5M>
      </div>
      <Button
        size='default'
        variant='ghost'
        disabled={currentIndex >= totalCount - INDEX_ZERO_LIST}
        iconProps={{
          name: 'chevronRight',
        }}
        onClick={() => onRowChange(currentIndex + 1)}
      />
    </div>
  )
}

export function DatasetParams({
  inputs,
  datasetInfo: data,
  setSelectedTab,
}: {
  datasetInfo: UseSelectDataset
  inputs: PlaygroundInputs
  setSelectedTab: ReactStateDispatch<ParamsSource>
}) {
  const selectedId = data.selectedDataset?.id
    ? String(data.selectedDataset.id)
    : undefined
  return (
    <div className='flex flex-col gap-y-4'>
      <div className='flex flex-row items-center justify-between gap-x-4'>
        <Select
          name='datasetId'
          placeholder={data.isLoading ? 'Loading...' : 'Select dataset'}
          disabled={data.isLoading}
          options={data.datasetOptions}
          onChange={data.onSelectDataset}
          value={selectedId}
        />
        <div className='flex-none'>
          <DatasetRowsPagination
            currentIndex={data.selectedRowIndex}
            totalCount={data.totalRows}
            onRowChange={data.onRowChange}
          />
        </div>
      </div>
      <div className={cn({ 'opacity-50': data.isLoading })}>
        <InputMapper
          inputs={inputs}
          isLoading={data.isLoading}
          mappedInputs={data.selectedRow.mappedInputs}
          headersOptions={data.datasetPreview.headersOptions}
          onSelectHeader={data.onSelectHeader}
          setSelectedTab={setSelectedTab}
        />
      </div>
    </div>
  )
}
