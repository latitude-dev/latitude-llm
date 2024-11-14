import { cn, ReactStateDispatch, Select } from '@latitude-data/web-ui'
import { PlaygroundInputs } from '$/hooks/useDocumentParameters'

import { ParamsSource } from '../index'
import { ParametersPaginationNav } from '../PaginationNav'
import { InputMapper } from './InputsMapper'
import { type UseSelectDataset } from './useSelectDataset'

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
  const onPrevPage = (page: number) => data.onRowChange(page - 1)
  const onNextPage = (page: number) => data.onRowChange(page + 1)
  return (
    <div className='flex flex-col gap-y-4'>
      <div className='flex flex-row items-center justify-between gap-x-4 border-b border-border pb-2'>
        <Select
          name='datasetId'
          placeholder={data.isLoading ? 'Loading...' : 'Select dataset'}
          disabled={data.isLoading}
          options={data.datasetOptions}
          onChange={data.onSelectDataset}
          value={selectedId}
        />
        <div className='flex-none'>
          <ParametersPaginationNav
            zeroIndex
            currentIndex={data.selectedRowIndex}
            totalCount={data.totalRows}
            onPrevPage={onPrevPage}
            onNextPage={onNextPage}
            label='rows in dataset'
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
