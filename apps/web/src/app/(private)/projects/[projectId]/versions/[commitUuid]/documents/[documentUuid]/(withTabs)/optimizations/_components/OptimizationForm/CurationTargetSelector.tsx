import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Slider } from '@latitude-data/web-ui/atoms/Slider'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { useCallback, useState } from 'react'

const DEFAULT_TARGET_ROWS = 250
const MIN_TARGET_ROWS = 50
const MAX_TARGET_ROWS = 500
const TARGET_ROWS_STEP = 50

const TARGET_ROWS_PRESETS = {
  small: {
    value: 100,
    label: 'Small',
    description: 'Quick runs with minimal data. Best for initial testing.',
  },
  standard: {
    value: 250,
    label: 'Standard',
    description: 'Balanced dataset size. Recommended for most use cases.',
  },
  large: {
    value: 500,
    label: 'Large',
    description: 'More examples for better coverage and accuracy.',
  },
} as const

type PresetKey = keyof typeof TARGET_ROWS_PRESETS

function PresetCard({
  label,
  description,
  valueLabel,
  selected,
  onSelect,
  disabled,
}: {
  label: string
  description: string
  valueLabel?: string
  selected: boolean
  onSelect: () => void
  disabled?: boolean
}) {
  return (
    <div
      onClick={disabled ? undefined : onSelect}
      className={cn(
        'flex flex-col gap-2 p-3 rounded-lg border transition-all text-left flex-1',
        {
          'border-primary bg-accent': selected,
          'border-border bg-background hover:bg-muted': !selected && !disabled,
          'opacity-50 cursor-not-allowed': disabled,
          'cursor-pointer': !disabled,
        },
      )}
    >
      <div className='flex items-center justify-between'>
        <Text.H6M
          color={selected ? 'primary' : 'foreground'}
          userSelect={false}
        >
          {label}
        </Text.H6M>
        {selected && (
          <Icon
            name='check'
            color='primary'
            size='small'
            className='shrink-0'
          />
        )}
      </div>
      <Text.H6 color='foregroundMuted' userSelect={false}>
        {description}
      </Text.H6>
      {valueLabel && (
        <Text.H6 color='foregroundMuted' userSelect={false}>
          {valueLabel}
        </Text.H6>
      )}
    </div>
  )
}

export function CurationTargetSelector({
  value,
  onChange,
  disabled,
}: {
  value?: number
  onChange: (value: number) => void
  disabled?: boolean
}) {
  const currentValue = value ?? DEFAULT_TARGET_ROWS
  const [isCustomMode, setIsCustomMode] = useState(() => {
    const presetValues = Object.values(TARGET_ROWS_PRESETS).map(
      (p) => p.value,
    ) as number[]
    return !presetValues.includes(currentValue)
  })

  const selectedPreset = (): PresetKey | null => {
    if (isCustomMode) return null
    const presetKeys = Object.keys(TARGET_ROWS_PRESETS) as PresetKey[]
    for (const key of presetKeys) {
      if (TARGET_ROWS_PRESETS[key].value === currentValue) {
        return key
      }
    }
    return null
  }

  const handlePresetSelect = useCallback(
    (presetKey: PresetKey) => {
      setIsCustomMode(false)
      onChange(TARGET_ROWS_PRESETS[presetKey].value)
    },
    [onChange],
  )

  const handleCustomSelect = useCallback(() => {
    setIsCustomMode(true)
  }, [])

  const handleSliderChange = useCallback(
    (values: number[]) => {
      const newValue = values[0]
      if (newValue !== undefined) {
        onChange(newValue)
      }
    },
    [onChange],
  )

  const presetKeys = Object.keys(TARGET_ROWS_PRESETS) as PresetKey[]
  const currentPreset = selectedPreset()

  return (
    <FormFieldGroup
      label='Curation target'
      description='Number of examples to curate from your recent traces'
      layout='vertical'
    >
      <div className='flex flex-col gap-4'>
        <div className='flex gap-2'>
          {presetKeys.map((key) => (
            <PresetCard
              key={key}
              label={TARGET_ROWS_PRESETS[key].label}
              description={TARGET_ROWS_PRESETS[key].description}
              valueLabel={`${TARGET_ROWS_PRESETS[key].value} examples`}
              selected={currentPreset === key}
              onSelect={() => handlePresetSelect(key)}
              disabled={disabled}
            />
          ))}
          <PresetCard
            label='Custom'
            description='Fine-tune the exact number of examples to curate.'
            valueLabel={isCustomMode ? `${currentValue} examples` : undefined}
            selected={isCustomMode}
            onSelect={handleCustomSelect}
            disabled={disabled}
          />
        </div>
        {isCustomMode && (
          <div className='flex flex-col gap-2'>
            <div className='flex items-center justify-between'>
              <Text.H6 color='foregroundMuted'>{MIN_TARGET_ROWS}</Text.H6>
              <Text.H5M color='primary'>{currentValue} examples</Text.H5M>
              <Text.H6 color='foregroundMuted'>{MAX_TARGET_ROWS}</Text.H6>
            </div>
            <Slider
              value={[currentValue]}
              min={MIN_TARGET_ROWS}
              max={MAX_TARGET_ROWS}
              step={TARGET_ROWS_STEP}
              onValueChange={handleSliderChange}
              disabled={disabled}
            />
          </div>
        )}
      </div>
    </FormFieldGroup>
  )
}
