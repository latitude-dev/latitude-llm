import {
  EvaluationType,
  LLM_EVALUATION_CUSTOM_PROMPT_DOCUMENTATION,
  LlmEvaluationCustomSpecification,
  LlmEvaluationMetric,
} from '@latitude-data/constants'
import { formatCount } from '@latitude-data/constants/formatCount'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { FormField } from '@latitude-data/web-ui/atoms/FormField'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { NumberInput } from '@latitude-data/web-ui/atoms/NumberInput'
import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import { useEffect } from 'react'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
} from '../index'

const specification = LlmEvaluationCustomSpecification
export default {
  ...specification,
  icon: 'code' as IconName,
  ConfigurationSimpleForm: ConfigurationSimpleForm,
  ConfigurationAdvancedForm: ConfigurationAdvancedForm,
  ResultBadge: ResultBadge,
  chartConfiguration: chartConfiguration,
}

function ConfigurationSimpleForm({
  mode,
  configuration,
  setConfiguration,
  settings,
  setSettings,
  errors,
  disabled,
}: ConfigurationFormProps<EvaluationType.Llm, LlmEvaluationMetric.Custom>) {
  // FIXME: Do not use useEffect to set local state. Move this to an event handler.
  useEffect(() => {
    if (mode !== 'create') return
    if (!configuration.provider || !configuration.model) return
    setConfiguration(
      Object.assign(configuration, {
        prompt: `
${LLM_EVALUATION_CUSTOM_PROMPT_DOCUMENTATION}

---
provider: ${configuration.provider}
model: ${configuration.model}
temperature: ${configuration.model.toLowerCase().startsWith('gpt-5') ? 1 : 0.7}
---

You're an expert LLM-as-a-judge evaluator. Your task is to judge whether the response, from another LLM model (the assistant), follows the given instructions.

<user>
  For context, here is the full conversation:
  \`\`\`
  {{ conversation }}
  \`\`\`
${
  // @ts-expect-error this component is reused for
  // both custom and custom labeled evaluations
  settings.metric === LlmEvaluationMetric.CustomLabeled
    ? `
  {{ if expectedOutput }}
    This is the expected output to compare against:
    \`\`\`
    {{ expectedOutput }}
    \`\`\`
  {{ endif }}
`
    : ''
}
  Evaluate the assistant response:
  \`\`\`
  {{ actualOutput }}
  \`\`\`
</user>
`.trim(),
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, configuration.provider, configuration.model, settings.metric])

  return (
    <>
      {mode === 'create' && (
        <FormField
          label='Prompt'
          description='The custom evaluation prompt the LLM will use to judge against'
          errors={errors?.['prompt']}
        >
          <Alert
            variant='default'
            description='You will configure the prompt after creating the evaluation'
          />
        </FormField>
      )}
      <SwitchInput
        checked={
          // @ts-expect-error this component is reused for
          // both custom and custom labeled evaluations
          settings.metric === LlmEvaluationMetric.CustomLabeled
        }
        label='Use expected output'
        description={`Use the {{expectedOutput}} variable in the evaluation prompt${mode !== 'create' ? '. You cannot change this setting once the evaluation is created' : ''}`}
        onCheckedChange={(checked) => {
          if (checked) {
            setSettings({
              ...settings,
              // @ts-expect-error this component is reused for
              // both custom and custom labeled evaluations
              metric: LlmEvaluationMetric.CustomLabeled,
            })
          } else {
            setSettings({ ...settings, metric: LlmEvaluationMetric.Custom })
          }
        }}
        disabled={disabled || mode !== 'create'}
        required
      />
      <FormFieldGroup
        layout='horizontal'
        description='The minimum and maximum score of the response'
      >
        <NumberInput
          value={configuration.minScore ?? undefined}
          name='minScore'
          label='Minimum score'
          placeholder='0'
          onChange={(value) => {
            if (value === undefined) return
            setConfiguration({ ...configuration, minScore: value })
          }}
          errors={errors?.['minScore']}
          className='w-full'
          disabled={disabled}
          required
        />
        <NumberInput
          value={configuration.maxScore ?? undefined}
          name='maxScore'
          label='Maximum score'
          placeholder='5'
          onChange={(value) => {
            if (value === undefined) return
            setConfiguration({ ...configuration, maxScore: value })
          }}
          errors={errors?.['maxScore']}
          className='w-full'
          disabled={disabled}
          required
        />
      </FormFieldGroup>
    </>
  )
}

function ConfigurationAdvancedForm({
  configuration,
  setConfiguration,
  errors,
  disabled,
}: ConfigurationFormProps<EvaluationType.Llm, LlmEvaluationMetric.Custom>) {
  return (
    <>
      <FormFieldGroup
        layout='horizontal'
        description='The minimum and maximum score threshold of the response'
      >
        <NumberInput
          value={configuration.minThreshold ?? undefined}
          name='minThreshold'
          label='Minimum threshold'
          placeholder='No minimum'
          min={configuration.minScore}
          max={configuration.maxScore}
          onChange={(value) =>
            setConfiguration({ ...configuration, minThreshold: value })
          }
          errors={errors?.['minThreshold']}
          className='w-full'
          disabled={disabled}
          required
        />
        <NumberInput
          value={configuration.maxThreshold ?? undefined}
          name='maxThreshold'
          label='Maximum threshold'
          placeholder='No maximum'
          min={configuration.minScore}
          max={configuration.maxScore}
          onChange={(value) =>
            setConfiguration({ ...configuration, maxThreshold: value })
          }
          errors={errors?.['maxThreshold']}
          className='w-full'
          disabled={disabled}
          required
        />
      </FormFieldGroup>
    </>
  )
}

function ResultBadge({
  result,
}: ResultBadgeProps<EvaluationType.Llm, LlmEvaluationMetric.Custom>) {
  return <>{formatCount(result.score!)}</>
}

function chartConfiguration({
  evaluation,
}: ChartConfigurationArgs<EvaluationType.Llm, LlmEvaluationMetric.Custom>) {
  return {
    min: evaluation.configuration.minScore,
    max: evaluation.configuration.maxScore,
    thresholds: {
      lower: evaluation.configuration.minThreshold,
      upper: evaluation.configuration.maxThreshold,
    },
    scale: (point: number) => point,
    format: (point: number, short?: boolean) =>
      short ? `${formatCount(point)}` : `${point.toFixed(2)}`,
  }
}
