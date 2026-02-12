import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'

export const OPTIMIZATION_PRESETS = {
  quick: {
    value: 'quick' as const,
    title: 'Quick',
    description: 'Fast execution with minimal exploration',
    duration: '~5 min',
    cost: 'Lower cost',
    configuration: {
      dataset: {
        target: 50, // 50 examples
      },
      budget: {
        time: 5 * 60, // 5 minutes
        tokens: 100_000, // 100k tokens
      },
    },
  },
  balanced: {
    value: 'balanced' as const,
    title: 'Balanced',
    description: 'Good trade-off between speed and quality',
    duration: '~15 min',
    cost: 'Medium cost',
    configuration: {
      dataset: {
        target: 250, // 250 examples
      },
      budget: {
        time: 15 * 60, // 15 minutes
        tokens: 10_000_000, // 10M tokens
      },
    },
  },
  deep: {
    value: 'deep' as const,
    title: 'Deep',
    description: 'Comprehensive run for best results',
    duration: '~1 hour',
    cost: 'Higher cost',
    configuration: {
      dataset: {
        target: 750, // 750 examples
      },
      budget: {
        time: 60 * 60, // 1 hour
        tokens: 50_000_000, // 50M tokens
      },
    },
  },
} as const

export type OptimizationPresetKey = keyof typeof OPTIMIZATION_PRESETS
type OptimizationPreset = (typeof OPTIMIZATION_PRESETS)[OptimizationPresetKey]

function PresetCard({
  preset,
  selected,
  onSelect,
  disabled,
}: {
  preset: OptimizationPreset
  selected: boolean
  onSelect: () => void
  disabled?: boolean
}) {
  return (
    <button
      type='button'
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        'flex flex-col gap-2 p-4 rounded-lg border transition-all text-left',
        {
          'border-primary bg-accent': selected,
          'border-border bg-background': !selected,
          'opacity-50 cursor-not-allowed': disabled,
        },
      )}
    >
      <div className='flex items-center justify-between'>
        <Text.H5M
          color={selected ? 'primary' : 'foreground'}
          userSelect={false}
        >
          {preset.title}
        </Text.H5M>
        {selected && (
          <Icon
            name='check'
            color='primary'
            size='small'
            className='shrink-0'
          />
        )}
      </div>
      <Text.H6 color='foregroundMuted'>{preset.description}</Text.H6>
      <div className='flex justify-start gap-2 mt-1'>
        <div className='flex items-center gap-1'>
          <Icon
            name='clock'
            size='small'
            color='foregroundMuted'
            className='shrink-0'
          />
          <Text.H6 color='foregroundMuted'>{preset.duration}</Text.H6>
        </div>
        <div className='flex items-center gap-1'>
          <Icon
            name='coins'
            size='small'
            color='foregroundMuted'
            className='shrink-0'
          />
          <Text.H6 color='foregroundMuted'>{preset.cost}</Text.H6>
        </div>
      </div>
    </button>
  )
}

function CustomPresetCard({ disabled }: { disabled?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center px-4 py-3 rounded-lg border border-dashed transition-all',
        'border-primary bg-accent',
        { 'opacity-50': disabled },
      )}
    >
      <div className='w-full flex items-center gap-2'>
        <div className='flex flex-1 items-center justify-center gap-2'>
          <Icon name='settings' color='primary' className='shrink-0' />
          <Text.H5M color='primary' userSelect={false}>
            Custom
          </Text.H5M>
        </div>
        <Icon name='check' color='primary' size='small' className='shrink-0' />
      </div>
    </div>
  )
}

export function PresetSelector({
  value,
  onChange,
  disabled,
}: {
  value: OptimizationPresetKey | 'custom'
  onChange: (value: OptimizationPresetKey) => void
  disabled?: boolean
}) {
  const presetKeys = Object.keys(
    OPTIMIZATION_PRESETS,
  ) as OptimizationPresetKey[]

  return (
    <div className='flex flex-col gap-3'>
      <div className='grid grid-cols-3 gap-3'>
        {presetKeys.map((key) => (
          <PresetCard
            key={key}
            preset={OPTIMIZATION_PRESETS[key]}
            selected={value === key}
            onSelect={() => onChange(key)}
            disabled={disabled}
          />
        ))}
      </div>
      {value === 'custom' && <CustomPresetCard disabled={disabled} />}
    </div>
  )
}
