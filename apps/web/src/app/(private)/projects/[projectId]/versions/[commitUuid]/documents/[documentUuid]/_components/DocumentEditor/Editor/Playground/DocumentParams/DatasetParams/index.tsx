import { ROUTES } from '$/services/routes'
import { DocumentVersion } from '@latitude-data/core/browser'
import {
  Button,
  cn,
  Icon,
  Select,
  type ICommitContextType,
} from '@latitude-data/web-ui'
import Link from 'next/link'

import { ParametersPaginationNav } from '../PaginationNav'
import { InputMapper } from './InputsMapper'
import { type UseSelectDataset } from './useSelectDataset'

function BlankSlate() {
  return (
    <Link
      href={ROUTES.datasets.root}
      className='flex flex-row items-center gap-1'
    >
      <Button variant='link'>
        Manage datasets &nbsp; <Icon name='externalLink' />
      </Button>
    </Link>
  )
}

export function DatasetParams({
  data,
  commit,
  document,
}: {
  document: DocumentVersion
  commit: ICommitContextType['commit']
  data: UseSelectDataset
}) {
  const selectedId = data.selectedDataset?.id
  const onPrevPage = (page: number) => data.onRowChange(page - 1)
  const onNextPage = (page: number) => data.onRowChange(page + 1)
  return (
    <div className='flex flex-col gap-y-4'>
      <div className='flex flex-row items-center justify-between gap-x-4 border-b border-border pb-4'>
        <Select
          name='datasetId'
          placeholder={data.isLoading ? 'Loading...' : 'Select dataset'}
          disabled={data.isLoading || !data.datasetOptions.length}
          options={data.datasetOptions}
          onChange={data.onSelectDataset}
          value={selectedId}
        />
        <div className='flex-none'>
          {data.selectedDataset && data.selectedRowIndex !== undefined ? (
            <ParametersPaginationNav
              zeroIndex
              currentIndex={data.selectedRowIndex}
              totalCount={data.totalRows}
              onPrevPage={onPrevPage}
              onNextPage={onNextPage}
              label='rows in dataset'
            />
          ) : (
            <BlankSlate />
          )}
        </div>
      </div>
      <div className={cn({ 'opacity-50': data.isLoading })}>
        <InputMapper
          key={selectedId}
          document={document}
          commit={commit}
          isLoading={data.isLoading}
          mappedInputs={data.selectedRow.mappedInputs}
          headersOptions={data.datasetPreview.headersOptions}
          onSelectHeader={data.onSelectHeader}
          selectedDataset={data.selectedDataset}
        />
      </div>
    </div>
  )
}
