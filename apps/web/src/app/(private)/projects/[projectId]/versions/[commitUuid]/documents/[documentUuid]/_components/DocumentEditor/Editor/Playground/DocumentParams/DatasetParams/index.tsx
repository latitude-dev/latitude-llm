import { ROUTES } from '$/services/routes'
import {
  DatasetVersion,
  DocumentVersion,
  LinkedDataset,
} from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { cn } from '@latitude-data/web-ui/utils'
import { Select, SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { ICommitContextType } from '@latitude-data/web-ui/providers'
import Link from 'next/link'

import { ParametersPaginationNav } from '../PaginationNav'
import { InputMapper } from './InputsMapper'
import { DatasetsV1InputMapper } from './InputsMapper/DatasetsV1InputsMapper'
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
          {data.isLoading ? (
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
                  label='rows in dataset'
                />
              ) : (
                <BlankSlate />
              )}
            </>
          )}
        </div>
      </div>
      <div className={cn({ 'opacity-50': data.isLoading })}>
        {/* TODO: Remove after datasets 2 migration */}
        {datasetVersion === DatasetVersion.V1 ? (
          <DatasetsV1InputMapper
            key={selectedId}
            document={document}
            commit={commit}
            isLoading={data.isLoading}
            mappedInputs={data.mappedInputs as LinkedDataset['mappedInputs']}
            rowCellOptions={data.rowCellOptions as SelectOption<number>[]}
            onSelectRowCell={data.onSelectRowCell as OnSelectRowCellFn<number>}
            selectedDataset={data.selectedDataset}
            datasetVersion={datasetVersion}
          />
        ) : (
          <InputMapper
            key={selectedId}
            document={document}
            commit={commit}
            parameters={data.parameters}
            isLoading={data.isLoading}
            rowCellOptions={data.rowCellOptions as SelectOption<string>[]}
            onSelectRowCell={data.onSelectRowCell as OnSelectRowCellFn<string>}
            selectedDataset={data.selectedDataset}
            datasetVersion={datasetVersion}
          />
        )}
      </div>
    </div>
  )
}
