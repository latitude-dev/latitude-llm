import {
  EvaluationMetric,
  EvaluationOptions,
  EvaluationSettings,
  EvaluationType,
  RuleEvaluationMetric,
} from '@latitude-data/constants'
import {
  Alert,
  FormFieldGroup,
  FormWrapper,
  IconName,
  Input,
  Select,
  SwitchInput,
  TextArea,
} from '@latitude-data/web-ui'
import { useEffect, useState } from 'react'
import ConfigurationForm from './ConfigurationForm'
import { EVALUATION_SPECIFICATIONS } from './index'

// TODO: Uncomment when all types are implemented
// const EVALUATION_TYPE_OPTIONS = Object.values(EvaluationType).map((type) => {
//   const specification = EVALUATION_SPECIFICATIONS[type]
//   return {
//     label: specification.name,
//     value: type,
//     icon: specification.icon,
//   }
// })

const EVALUATION_METRIC_OPTIONS = (_type: EvaluationType) => {
  // TODO: Add other evaluation types with a switch type
  return (
    Object.values(RuleEvaluationMetric)
      // TODO: Remove undefined filter when all metrics are implemented
      .filter(
        (metric) =>
          !!EVALUATION_SPECIFICATIONS[EvaluationType.Rule].metrics[metric],
      )
      .map((metric) => {
        const specification =
          EVALUATION_SPECIFICATIONS[EvaluationType.Rule].metrics[metric]
        return {
          label: specification.name,
          value: metric,
          icon: specification.icon,
        }
      }) as { label: string; value: EvaluationMetric; icon: IconName }[] // TODO: Remove type assertion when all metrics are implemented
  )
}

export default function EvaluationV2Form<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  mode,
  settings: defaultSettings,
  options: defaultOptions,
  onSettingsChange,
  onOptionsChange,
  disabled,
}: {
  mode: 'create' | 'update'
  settings?: EvaluationSettings<T, M>
  onSettingsChange?: (settings: EvaluationSettings<T, M>) => void
  options?: Partial<EvaluationOptions>
  onOptionsChange?: (options: Partial<EvaluationOptions>) => void
  disabled?: boolean
}) {
  const [settings, setSettings] = useState({
    name: defaultSettings?.name ?? 'Accuracy',
    description: defaultSettings?.description ?? 'Matches the expected output?',
    type: defaultSettings?.type ?? EvaluationType.Rule,
    metric: defaultSettings?.metric ?? RuleEvaluationMetric.ExactMatch,
    configuration: defaultSettings?.configuration ?? {
      reverseScale: false,
      caseInsensitive: false,
    },
  } as EvaluationSettings<T, M>)
  useEffect(() => onSettingsChange?.(settings), [settings])

  const [options, setOptions] = useState({
    evaluateLiveLogs: defaultOptions?.evaluateLiveLogs ?? true,
    enableSuggestions: defaultOptions?.enableSuggestions ?? true,
    autoApplySuggestions: defaultOptions?.autoApplySuggestions ?? true,
  } as EvaluationOptions)
  useEffect(() => onOptionsChange?.(options), [options])

  const typeSpecification = EVALUATION_SPECIFICATIONS[settings.type]
  const metricSpecification = typeSpecification?.metrics[settings.metric]

  useEffect(() => {
    if (!metricSpecification) return
    setOptions({
      ...options,
      evaluateLiveLogs: !!metricSpecification.supportsLiveEvaluation,
    })
  }, [metricSpecification?.supportsLiveEvaluation])

  return (
    <form className='min-w-0' id='evaluationV2Form'>
      <FormWrapper>
        <Input
          value={settings.name}
          name='name'
          label='Name'
          placeholder='Give your evaluation a name'
          onChange={(e) => setSettings({ ...settings, name: e.target.value })}
          className='w-full'
          disabled={disabled}
          required
        />
        <TextArea
          value={settings.description}
          name='description'
          label='Description'
          placeholder='Describe what this evaluation is for'
          minRows={2}
          maxRows={4}
          onChange={(e) =>
            setSettings({ ...settings, description: e.target.value })
          }
          className='w-full'
          disabled={disabled}
          required
        />
        {/* TODO: Uncomment when all types are implemented */}
        {/*{mode === 'create' && (<Select
          value={settings.type}
          name='type'
          label='Type'
          description={typeSpecification.description}
          placeholder='Select an evaluation type'
          options={EVALUATION_TYPE_OPTIONS}
          onChange={(value) => setSettings({ ...settings, type: value as T })}
          disabled={disabled}
          required
        />)} */}
        {mode === 'create' && (
          <Select
            value={settings.metric}
            name='metric'
            label='Metric'
            description={metricSpecification?.description}
            placeholder='Select an evaluation metric'
            options={EVALUATION_METRIC_OPTIONS(settings.type)}
            onChange={(value) =>
              setSettings({ ...settings, metric: value as M })
            }
            disabled={disabled}
            required
          />
        )}
        <FormFieldGroup layout='vertical'>
          <ConfigurationForm
            mode={mode}
            type={settings.type}
            metric={settings.metric}
            configuration={settings.configuration}
            onChange={(value) =>
              setSettings({ ...settings, configuration: value })
            }
            disabled={disabled}
          />
          {mode === 'create' && metricSpecification?.requiresExpectedOutput && (
            <Alert
              variant='default'
              title='This evaluation requires an expected output'
              description='You will configure the column that contains the expected output when you run a batch evaluation'
            />
          )}
        </FormFieldGroup>
        {mode === 'update' && (
          <FormFieldGroup label='Options' layout='vertical'>
            {metricSpecification?.supportsLiveEvaluation && (
              <SwitchInput
                checked={!!options.evaluateLiveLogs}
                name='evaluateLiveLogs'
                label='Evaluate live logs'
                description='Evaluate production and playground logs automatically'
                onCheckedChange={(value) =>
                  setOptions({ ...options, evaluateLiveLogs: value })
                }
                disabled={
                  disabled || !metricSpecification?.supportsLiveEvaluation
                }
              />
            )}
            <SwitchInput
              checked={!!options.enableSuggestions}
              name='enableSuggestions'
              label='Prompt suggestions'
              description='Generate suggestions to improve your prompt based on the latest evaluations results'
              onCheckedChange={(value) =>
                setOptions({ ...options, enableSuggestions: value })
              }
              disabled={disabled}
            />
            {/* TODO: Uncomment when experiments are implemented */}
            {/* <SwitchInput
                  checked={!!options.autoApplySuggestions}
                  name='autoApplySuggestions'
                  label='Auto apply suggestions'
                  description='Automatically apply the generated suggestions to your prompt'
                  onCheckedChange={(value) =>
                    setOptions({ ...options, autoApplySuggestions: value })
                  }
                  disabled={disabled}
                /> */}
          </FormFieldGroup>
        )}
      </FormWrapper>
    </form>
  )
}
