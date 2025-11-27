import { useCallback, useMemo } from 'react'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { SelectTriggerPrimitive } from '@latitude-data/web-ui/atoms/Select'
import { ParameterType } from '@latitude-data/constants'

const ParameterTypeDetails = {
  [ParameterType.Text]: {
    label: 'Text',
    icon: <Icon name='letterText' />,
  },
  [ParameterType.Image]: {
    label: 'Image',
    icon: <Icon name='image' />,
  },
  [ParameterType.File]: {
    label: 'File',
    icon: <Icon name='paperclip' />,
  },
}

export function ParameterTypeSelector({
  parameter,
  parameterType,
  onTypeChange,
  disabled = false,
}: {
  parameter: string
  parameterType: ParameterType
  onTypeChange: (type: ParameterType) => void
  disabled?: boolean
}) {
  const selectedType = useMemo(
    () =>
      Object.values(ParameterType).includes(parameterType)
        ? parameterType
        : ParameterType.Text,
    [parameterType],
  )

  const handleTypeChange = useCallback(
    (type: ParameterType) => {
      onTypeChange(type)
    },
    [onTypeChange],
  )

  return (
    <Select<ParameterType>
      name={`type-${parameter}`}
      value={selectedType}
      onChange={handleTypeChange}
      options={Object.values(ParameterType).map((type) => ({
        value: type,
        label: ParameterTypeDetails[type].label,
        icon: ParameterTypeDetails[type].icon,
      }))}
      disabled={disabled}
      width='auto'
      trigger={
        <Tooltip
          asChild
          trigger={
            <SelectTriggerPrimitive className='focus:outline-none flex items-center justify-center gap-x-0.5 text-muted-foreground hover:text-primary transition colors'>
              {ParameterTypeDetails[selectedType].icon}
              {!disabled && <Icon name='chevronsUpDown' size='small' />}
            </SelectTriggerPrimitive>
          }
        >
          {ParameterTypeDetails[selectedType].label} parameter
        </Tooltip>
      }
    />
  )
}
