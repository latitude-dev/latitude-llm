import {
  OPTIMIZATION_MAX_TIME,
  OPTIMIZATION_MAX_TOKENS,
  OptimizationBudget,
} from '@latitude-data/constants'
import { formatCount } from '@latitude-data/constants/formatCount'
import { FormField } from '@latitude-data/web-ui/atoms/FormField'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { Slider } from '@latitude-data/web-ui/atoms/Slider'
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
  return formatCount(tokens, { decimalPlaces: 0 })
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
        <Slider
          legend={formatTime}
          value={[timeValue]}
          min={OPTIMIZATION_MIN_TIME}
          max={OPTIMIZATION_MAX_TIME}
          step={OPTIMIZATION_TIME_STEP}
          onValueChange={handleTimeChange}
          disabled={disabled}
        />
      </FormField>
      <FormField
        label='Usage limit'
        description='The optimization will stop after prompt and evaluation runs reach this token limit'
        errors={errors?.['budget.tokens']}
      >
        <Slider
          legend={formatTokens}
          value={[tokensValue]}
          min={OPTIMIZATION_MIN_TOKENS}
          max={OPTIMIZATION_MAX_TOKENS}
          step={OPTIMIZATION_TOKENS_STEP}
          onValueChange={handleTokensChange}
          disabled={disabled}
        />
      </FormField>
    </FormFieldGroup>
  )
}
