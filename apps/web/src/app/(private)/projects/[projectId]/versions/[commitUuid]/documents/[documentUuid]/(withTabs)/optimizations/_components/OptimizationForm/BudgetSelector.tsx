import {
  OPTIMIZATION_MAX_TIME,
  OPTIMIZATION_MAX_TOKENS,
  OptimizationBudget,
} from '@latitude-data/constants'
import { FormField } from '@latitude-data/web-ui/atoms/FormField'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { Slider } from '@latitude-data/web-ui/atoms/Slider'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCallback } from 'react'

// Note: these minimum values are only for the frontend
const OPTIMIZATION_MIN_TIME = 5 * 60 // 5 minutes
const OPTIMIZATION_MIN_TOKENS = 100_000 // 100k tokens

const OPTIMIZATION_TIME_STEP = 5 * 60 // 5 minutes
const OPTIMIZATION_TOKENS_STEP = 1_000_000 // 1M tokens

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    return `${minutes} min`
  }
  const hours = seconds / 3600
  const label = hours > 1 ? 'hours' : 'hour'
  const value = hours === Math.floor(hours) ? hours : hours.toFixed(1)
  return `${value} ${label}`
}

function formatTokens(tokens: number): string {
  if (tokens < 1_000) return `${tokens}`
  if (tokens < 1_000_000) return `${(tokens / 1_000).toFixed(0)}K`
  return `${(tokens / 1_000_000).toFixed(0)}M`
}

export function BudgetSelector({
  value,
  onChange,
  errors,
  disabled,
}: {
  value?: OptimizationBudget
  onChange: (value: OptimizationBudget) => void
  errors?: Record<string, string[]>
  disabled?: boolean
}) {
  const timeValue = value?.time ?? OPTIMIZATION_MIN_TIME
  const tokensValue = value?.tokens ?? OPTIMIZATION_MIN_TOKENS

  const handleTimeChange = useCallback(
    (values: number[]) => {
      const newValue = values[0]
      if (newValue !== undefined) {
        onChange({ ...value, time: newValue })
      }
    },
    [value, onChange],
  )

  const handleTokensChange = useCallback(
    (values: number[]) => {
      const newValue = values[0]
      if (newValue !== undefined) {
        onChange({ ...value, tokens: newValue })
      }
    },
    [value, onChange],
  )

  return (
    <FormFieldGroup
      label='Budget'
      layout='vertical'
      tooltip="The optimization will continue running until it reaches a perfect score, it stagnates for too many iterations or until the budget is exhausted. This only applies to the 'Optimizing prompt...' phase"
      group
    >
      <FormField
        label='Time limit'
        description='The optimization will stop after this duration has passed'
        errors={errors?.['budget.time']}
      >
        <div className='flex flex-col gap-2'>
          <div className='flex items-center justify-between'>
            <Text.H6 color='foregroundMuted'>
              {formatTime(OPTIMIZATION_MIN_TIME)}
            </Text.H6>
            <Text.H5M color='primary'>{formatTime(timeValue)}</Text.H5M>
            <Text.H6 color='foregroundMuted'>
              {formatTime(OPTIMIZATION_MAX_TIME)}
            </Text.H6>
          </div>
          <Slider
            value={[timeValue]}
            min={OPTIMIZATION_MIN_TIME}
            max={OPTIMIZATION_MAX_TIME}
            step={OPTIMIZATION_TIME_STEP}
            onValueChange={handleTimeChange}
            disabled={disabled}
          />
        </div>
      </FormField>
      <FormField
        label='Usage limit'
        description='The optimization will stop after prompt and evaluation runs reach this token limit'
        errors={errors?.['budget.tokens']}
      >
        <div className='flex flex-col gap-2'>
          <div className='flex items-center justify-between'>
            <Text.H6 color='foregroundMuted'>
              {formatTokens(OPTIMIZATION_MIN_TOKENS)}
            </Text.H6>
            <Text.H5M color='primary'>{formatTokens(tokensValue)}</Text.H5M>
            <Text.H6 color='foregroundMuted'>
              {formatTokens(OPTIMIZATION_MAX_TOKENS)}
            </Text.H6>
          </div>
          <Slider
            value={[tokensValue]}
            min={OPTIMIZATION_MIN_TOKENS}
            max={OPTIMIZATION_MAX_TOKENS}
            step={OPTIMIZATION_TOKENS_STEP}
            onValueChange={handleTokensChange}
            disabled={disabled}
          />
        </div>
      </FormField>
    </FormFieldGroup>
  )
}
