import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { Slider } from '@latitude-data/web-ui/atoms/Slider'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCallback } from 'react'

export function IterationsSlider({
  value = 1,
  onChange,
  errors,
  disabled,
}: {
  value?: number
  onChange: (value: number) => void
  errors?: Record<string, string[]>
  disabled?: boolean
}) {
  const handleChange = useCallback(
    (values: number[]) => {
      const newValue = values[0]
      if (newValue !== undefined) {
        onChange(newValue)
      }
    },
    [onChange],
  )

  return (
    <FormFieldGroup
      label='Iterations'
      description='Number of optimization passes. More iterations may yield better results but will take longer'
      layout='vertical'
      errors={errors?.['iterations']}
    >
      <div className='flex flex-col gap-2'>
        <div className='flex items-center justify-between'>
          <Text.H6 color='foregroundMuted'>1</Text.H6>
          <Text.H5M color='primary'>{value} iterations</Text.H5M>
          <Text.H6 color='foregroundMuted'>100</Text.H6>
        </div>
        <Slider
          value={[value]}
          min={1}
          max={100}
          step={1}
          onValueChange={handleChange}
          disabled={disabled}
        />
      </div>
    </FormFieldGroup>
  )
}
