import useDatasets from '$/stores/datasets'
import {
  OPTIMIZATION_MAX_ROWS,
  OPTIMIZATION_MIN_ROWS,
} from '@latitude-data/constants'
import { formatCount } from '@latitude-data/constants/formatCount'
import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'
import { FormField } from '@latitude-data/web-ui/atoms/FormField'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Slider } from '@latitude-data/web-ui/atoms/Slider'
import { useCallback, useEffect, useMemo } from 'react'

export function DatasetSelector({
  datasetId,
  onDatasetChange,
  target,
  onTargetChange,
  errors,
  disabled,
}: {
  datasetId?: number
  onDatasetChange: (dataset?: Dataset) => void
  target?: number
  onTargetChange: (value?: number) => void
  errors?: Record<string, string[]>
  disabled?: boolean
}) {
  const { data: datasets, isLoading } = useDatasets({
    page: '1',
    pageSize: '10000', // No pagination
  })

  const selectedDataset = useMemo(
    () => datasets?.find((d) => d.id === datasetId),
    [datasets, datasetId],
  )
  useEffect(() => {
    onDatasetChange(selectedDataset)
  }, [selectedDataset, onDatasetChange])

  const options = useMemo(() => {
    return (
      datasets?.map((dataset) => ({
        value: String(dataset.id),
        label: dataset.name,
      })) ?? []
    )
  }, [datasets])

  const handleChange = useCallback(
    (val: string | undefined) => {
      const dataset = val
        ? datasets?.find((d) => d.id === Number(val))
        : undefined
      onDatasetChange(dataset)
    },
    [datasets, onDatasetChange],
  )

  const targetValue = target ?? OPTIMIZATION_MAX_ROWS

  const handleTargetChange = useCallback(
    (values: number[]) => {
      const newValue = values[0]
      if (newValue !== undefined) {
        onTargetChange(newValue)
      }
    },
    [onTargetChange],
  )

  const disclosure =
    'Remember that optimization algorithms need a sufficient amount of data to generalize and converge to avoid noise and bias'

  return (
    <FormFieldGroup
      label='Dataset'
      tooltip={
        !!datasetId &&
        `We will use the first ${OPTIMIZATION_MAX_ROWS} rows. ${disclosure}`
      }
      layout='vertical'
      group
    >
      <Select
        value={datasetId ? String(datasetId) : undefined}
        name='datasetId'
        description='The dataset used to train and test the optimization on. If not provided, one will be automatically curated from your recent traces'
        placeholder='Auto-curate dataset'
        placeholderIcon='sparkles'
        options={options}
        onChange={handleChange}
        errors={errors?.['datasetId']}
        loading={isLoading}
        disabled={disabled || isLoading}
        searchable
        removable
      />
      {!datasetId && (
        <FormField
          label='Curation target'
          description={`We will try to curate up to ${targetValue} high-quality traces. ${disclosure}`}
        >
          <Slider
            legend={formatCount}
            value={[targetValue]}
            min={OPTIMIZATION_MIN_ROWS}
            max={OPTIMIZATION_MAX_ROWS}
            step={1}
            onValueChange={handleTargetChange}
            disabled={disabled}
          />
        </FormField>
      )}
    </FormFieldGroup>
  )
}
