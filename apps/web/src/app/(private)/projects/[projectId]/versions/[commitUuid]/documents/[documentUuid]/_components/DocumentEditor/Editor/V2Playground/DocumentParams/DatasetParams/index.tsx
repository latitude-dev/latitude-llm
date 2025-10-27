import { ROUTES } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Select, SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import type { ICommitContextType } from '$/app/providers/CommitProvider'
import Link from 'next/link'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

import { ParametersPaginationNav } from '$/components/ParametersPaginationNav'
import { InputMapper } from './InputsMapper'
import { type OnSelectRowCellFn } from './InputsMapper/InputsMapperItem'
import { type UseSelectDataset } from './useSelectDataset'
import { useCallback } from 'react'

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
}: {
  document: DocumentVersion
  commit: ICommitContextType['commit']
  data: UseSelectDataset
}) {
  const selectedId = data.selectedDataset?.id
  const isLoading = data.loadingState.datasets || data.loadingState.position
  const onPrevPage = useCallback(
    () => data.onPrevPage(data.position ? data.position - 1 : 1),
    [data],
  )
  const onNextPage = useCallback(
    () => data.onNextPage(data.position ? data.position + 1 : 1),
    [data],
  )
  return (
    <div className='flex flex-col gap-y-4'>
      <div className='flex flex-row items-center justify-between gap-x-4 border-b border-border pb-4'>
        <Select
          width='auto'
          name='datasetId'
          placeholder={
            data.loadingState.datasets ? 'Loading...' : 'Select dataset'
          }
          disabled={data.loadingState.datasets || !data.datasetOptions.length}
          options={data.datasetOptions}
          onChange={data.onSelectDataset}
          value={selectedId}
        />
        <div className='min-w-0'>
          {isLoading ? (
            <Skeleton height='h5' className='w-40 min-w-0' />
          ) : (
            <>
              {data.selectedDataset && data.position !== undefined ? (
                <ParametersPaginationNav
                  currentIndex={data.position}
                  totalCount={data.count}
                  onPrevPage={onPrevPage}
                  onNextPage={onNextPage}
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
      />
    </div>
  )
}
