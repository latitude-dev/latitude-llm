import { ROUTES } from '$/services/routes'
import { DatasetVersion, DocumentVersion } from '@latitude-data/core/browser'
import {
  Button,
  cn,
  Select,
  SelectOption,
  Skeleton,
  type ICommitContextType,
} from '@latitude-data/web-ui'
import Link from 'next/link'

import { ParametersPaginationNav } from '../PaginationNav'
import { InputMapper } from './InputsMapper'
import { type OnSelectRowCellFn } from './InputsMapper/InputsMapperItem'
import { type UseSelectDataset } from './useSelectDataset'

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
  data,
  commit,
  document,
  datasetVersion,
}: {
  document: DocumentVersion
  commit: ICommitContextType['commit']
  data: UseSelectDataset
  datasetVersion: DatasetVersion
}) {
  const selectedId = data.selectedDataset?.id
  return (
    <div className='flex flex-col gap-y-4'>
      <div className='flex flex-row items-center justify-between gap-x-4 border-b border-border pb-4'>
        <Select
          width='auto'
          name='datasetId'
          placeholder={data.isLoading ? 'Loading...' : 'Select dataset'}
          disabled={data.isLoading || !data.datasetOptions.length}
          options={data.datasetOptions}
          onChange={data.onSelectDataset}
          value={selectedId}
        />
        <div className='min-w-0'>
          {data.loadingState.position ? (
            <Skeleton height='h5' className='w-40 min-w-0' />
          ) : (
            <>
              {data.selectedDataset && data.position !== undefined ? (
                <ParametersPaginationNav
                  zeroIndex={datasetVersion === DatasetVersion.V1}
                  currentIndex={data.position}
                  totalCount={data.count}
                  onPrevPage={data.onPrevPage}
                  onNextPage={data.onNextPage}
                  disabled={
                    data.loadingState.position || data.loadingState.rows
                  }
                  label='rows in dataset'
                />
              ) : (
                <BlankSlate />
              )}
            </>
          )}
        </div>
      </div>
      <InputMapper
        key={selectedId}
        document={document}
        commit={commit}
        loadingState={data.loadingState}
        rowCellOptions={data.rowCellOptions as SelectOption<string>[]}
        onSelectRowCell={data.onSelectRowCell as OnSelectRowCellFn<string>}
        datasetVersion={datasetVersion}
      />
    </div>
  )
}
