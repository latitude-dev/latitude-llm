import useDatasets from '$/stores/datasets'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { useMemo } from 'react'

export function DatasetSelector({
  value,
  onChange,
  errors,
  disabled,
}: {
  value?: number
  onChange: (value?: number) => void
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

  return (
    <Select
      value={value ? String(value) : undefined}
      name='datasetId'
      label='Dataset'
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
  )
}
