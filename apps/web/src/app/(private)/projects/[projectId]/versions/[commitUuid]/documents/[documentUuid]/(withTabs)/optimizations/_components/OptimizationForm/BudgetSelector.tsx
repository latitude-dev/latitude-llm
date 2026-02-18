import {
  OPTIMIZATION_MAX_TIME,
  OPTIMIZATION_MAX_TOKENS,
  OptimizationBudget,
  Providers,
} from '@latitude-data/constants'
import { formatCount } from '@latitude-data/constants/formatCount'
import { estimateCost } from '@latitude-data/core/services/ai/estimateCost/index'
import { FormField } from '@latitude-data/web-ui/atoms/FormField'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { Slider } from '@latitude-data/web-ui/atoms/Slider'
import { useCallback, useMemo } from 'react'

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

function formatCost(dollars: number): string {
  if (dollars < 0.01) return '<$0.01'
  if (dollars < 100) return `$${dollars.toFixed(2)}`
  return `$${Math.round(dollars)}`
}

function estimateTokensCost({
  provider,
  model,
  tokens,
}: {
  provider: Providers
  model: string
  tokens: number
}): number | undefined {
  const cost = estimateCost({
    provider,
    model,
    usage: {
      inputTokens: 0,
      outputTokens: tokens,
      promptTokens: 0,
      completionTokens: tokens,
      totalTokens: tokens,
      reasoningTokens: 0,
      cachedInputTokens: 0,
    },
  })
  return cost > 0 ? cost : undefined
}

export function BudgetSelector({
  value,
  onChange,
  provider,
  model,
  errors,
  disabled,
}: {
  value?: OptimizationBudget
  onChange: (value: OptimizationBudget) => void
  provider?: Providers
  model?: string
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

  const tokensLegend = useMemo(() => {
    const costLabel =
      provider && model
        ? estimateTokensCost({ provider, model, tokens: tokensValue })
        : undefined

    return {
      min: formatTokens(OPTIMIZATION_MIN_TOKENS),
      value: costLabel
        ? `${formatTokens(tokensValue)} (~${formatCost(costLabel)})`
        : formatTokens(tokensValue),
      max: formatTokens(OPTIMIZATION_MAX_TOKENS),
    }
  }, [provider, model, tokensValue])

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
          legend={tokensLegend}
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
