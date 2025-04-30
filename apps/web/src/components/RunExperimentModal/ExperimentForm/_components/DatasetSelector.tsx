import { ExperimentFormPayload } from '../useExperimentFormPayload'
import useDatasets from '$/stores/datasets'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import Link from 'next/link'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ROUTES } from '$/services/routes'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { useCallback, useMemo } from 'react'

export function DatasetSelector({
  document,
  selectedDataset,
  onSelectDataset,
  parameters,
}: ExperimentFormPayload & {
  parameters?: string[]
}) {
  const { data: datasets, isLoading: isLoadingDatasets } = useDatasets()

  const selectOptions = useMemo(
    () =>
      datasets.map((ds) => ({
        value: ds.id,
        label: ds.name,
      })),
    [datasets],
  )

  const onSelectOption = useCallback(
    (datasetId: number) => {
      const selectedDataset = datasets.find((ds) => ds.id === Number(datasetId))
      if (selectedDataset) {
        onSelectDataset(selectedDataset)
      }
    },
    [datasets, onSelectDataset],
  )

  if (isLoadingDatasets) {
    return <Skeleton height='h2' className='w-1/2' />
  }

  return (
    <div className='flex flex-row items-center gap-4 w-1/2'>
      {datasets.length > 0 && (
        <div className='flex-grow'>
          <Select
            name='datasetId'
            placeholder='Select dataset'
            options={selectOptions}
            onChange={onSelectOption}
            value={selectedDataset?.id}
          />
        </div>
      )}
      <div className='flex flex-row items-center gap-2'>
        {datasets.length === 0 && (
          <>
            <Link
              className='flex flex-row items-center gap-1 hover:underline'
              href={ROUTES.datasets.root({ modal: 'new' })}
            >
              <Text.H5 color='primary'>Upload dataset</Text.H5>
              <Icon color='primary' name='externalLink' />
            </Link>
            <Text.H6M>or</Text.H6M>
          </>
        )}
        {parameters === undefined ? (
          <Skeleton height='h2' className='w-1/2' />
        ) : (
          <Link
            className='flex flex-row items-center gap-1 hover:underline'
            href={ROUTES.datasets.root({
              modal: 'generate',
              name: `Dataset for prompt: ${document.path}`,
              parameters: parameters.join(','),
              backUrl: window.location.href,
            })}
          >
            <Text.H5 color='primary'>Generate dataset</Text.H5>
            <Icon color='primary' name='externalLink' />
          </Link>
        )}
      </div>
    </div>
  )
}
