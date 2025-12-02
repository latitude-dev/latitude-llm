import { useMemo } from 'react'
import { Select, SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { Providers } from '@latitude-data/constants'
import {
  getReasoningCapabilities,
  ReasoningEffort,
  ReasoningSummary,
} from '@latitude-data/core/services/ai/providers/models/index'
import { ConfigElement, ConfigSection } from './_components/ConfigSection'
import { PromptConfigurationProps, useConfigValue } from './utils'
import useProviders from '$/stores/providerApiKeys'

const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

const REASONING_SUMMARY_LABELS: Record<ReasoningSummary, string> = {
  auto: 'Auto',
  detailed: 'Detailed',
}

export function ReasoningSettings({
  config,
  setConfig,
  disabled,
}: PromptConfigurationProps) {
  const { data: providers } = useProviders()
  const providerName = config['provider'] as string | undefined
  const model = config['model'] as string | undefined

  const provider = useMemo(
    () => providers.find((p) => p.name === providerName),
    [providers, providerName],
  )

  const reasoningCapabilities = useMemo(() => {
    if (!provider?.provider || !model) return undefined
    return getReasoningCapabilities({
      provider: provider.provider as Providers,
      model,
    })
  }, [provider?.provider, model])

  const reasoningEffortOptions = useMemo<SelectOption<string>[]>(() => {
    if (!reasoningCapabilities?.reasoningEffort) return []
    return reasoningCapabilities.reasoningEffort.map((value) => ({
      label: REASONING_EFFORT_LABELS[value],
      value,
    }))
  }, [reasoningCapabilities?.reasoningEffort])

  const reasoningSummaryOptions = useMemo<SelectOption<string>[]>(() => {
    if (!reasoningCapabilities?.reasoningSummary) return []
    return reasoningCapabilities.reasoningSummary.map((value) => ({
      label: REASONING_SUMMARY_LABELS[value],
      value,
    }))
  }, [reasoningCapabilities?.reasoningSummary])

  const { value: reasoningEffort, setValue: setReasoningEffort } =
    useConfigValue<string | undefined>({
      config,
      setConfig,
      key: 'reasoningEffort',
      defaultValue: 'medium',
    })

  const { value: reasoningSummary, setValue: setReasoningSummary } =
    useConfigValue<string | undefined>({
      config,
      setConfig,
      key: 'reasoningSummary',
      defaultValue: 'auto',
    })

  if (!reasoningCapabilities) {
    return null
  }

  return (
    <ConfigSection title='Reasoning'>
      {reasoningEffortOptions.length > 0 && (
        <ConfigElement
          label='Reasoning effort'
          icon='brain'
          summary='Controls the depth of reasoning the model uses before responding.'
          description={`The reasoning effort parameter controls how much time the model spends reasoning before generating a response.
None: No reasoning (only available for GPT-5.1).
Minimal: Quick reasoning suitable for simple tasks.
Low: Light reasoning, offering faster responses.
Medium: Balanced reasoning for general use cases.
High: Deep reasoning for complex problems.`}
        >
          <div className='w-32'>
            <Select
              name='reasoningEffort'
              placeholder='Select...'
              disabled={disabled}
              options={reasoningEffortOptions}
              value={reasoningEffort}
              onChange={(value) =>
                setReasoningEffort(value === '' ? undefined : value)
              }
            />
          </div>
        </ConfigElement>
      )}
      {reasoningSummaryOptions.length > 0 && (
        <ConfigElement
          label='Reasoning summary'
          icon='rollText'
          summary='Controls whether the model returns its reasoning process.'
          description={`The reasoning summary parameter controls whether and how the model returns its reasoning process.
Auto: A condensed summary of the reasoning process.
Detailed: A more comprehensive reasoning summary.`}
        >
          <div className='w-32'>
            <Select
              name='reasoningSummary'
              placeholder='Select...'
              disabled={disabled}
              options={reasoningSummaryOptions}
              value={reasoningSummary}
              onChange={(value) =>
                setReasoningSummary(value === '' ? undefined : value)
              }
            />
          </div>
        </ConfigElement>
      )}
    </ConfigSection>
  )
}
