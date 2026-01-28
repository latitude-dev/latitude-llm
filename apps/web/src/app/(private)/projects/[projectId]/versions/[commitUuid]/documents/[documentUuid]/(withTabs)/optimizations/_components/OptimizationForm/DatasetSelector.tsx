import useDatasets from '$/stores/datasets'
import { OPTIMIZATION_MAX_ROWS } from '@latitude-data/constants'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { useMemo } from 'react'
import { CurationTargetSelector } from './CurationTargetSelector'

export function DatasetSelector({
  value,
  onChange,
  targetRows,
  onTargetRowsChange,
  errors,
  disabled,
}: {
  value?: number
  onChange: (value?: number) => void
  targetRows?: number
  onTargetRowsChange: (value: number) => void
  errors?: Record<string, string[]>
  disabled?: boolean
}) {
  const { data: datasets, isLoading } = useDatasets({
    page: '1',
    pageSize: '10000', // No pagination
  })

  const options = useMemo(() => {
    return (
      datasets?.map((dataset) => ({
        value: String(dataset.id),
        label: dataset.name,
      })) ?? []
    )
  }, [datasets])

  const isAutoCurate = !value

  return (
    <div className='flex flex-col gap-4'>
      <FormFieldGroup
        label='Dataset'
        tooltip={
          isAutoCurate
            ? 'We will curate high-quality traces from your recent runs. Use the slider below to configure the target number of examples'
            : `If you provide a dataset, the first ${OPTIMIZATION_MAX_ROWS} rows will be used`
        }
      >
        <Select
          value={value ? String(value) : undefined}
          name='datasetId'
          description='The dataset used to train and test the optimization on. If not provided, one will be automatically curated from your recent traces'
          placeholder='Auto-curate dataset'
          placeholderIcon='sparkles'
          options={options}
          onChange={(val) => onChange(val ? Number(val) : undefined)}
          errors={errors?.['datasetId']}
          loading={isLoading}
          disabled={disabled || isLoading}
          searchable
          removable
        />
      </FormFieldGroup>
      {isAutoCurate && (
        <CurationTargetSelector
          value={targetRows}
          onChange={onTargetRowsChange}
          disabled={disabled}
        />
      )}
    </div>
  )
}
