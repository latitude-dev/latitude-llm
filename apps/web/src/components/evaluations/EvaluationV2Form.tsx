import { useFeatureFlag } from '$/components/Providers/FeatureFlags'
import { ActionErrors, parseActionErrors } from '$/hooks/useLatitudeAction'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import {
  EvaluationMetric,
  EvaluationOptions,
  EvaluationSettings,
  EvaluationType,
  HumanEvaluationMetric,
  LlmEvaluationMetric,
  RuleEvaluationMetric,
} from '@latitude-data/constants'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { TabSelect } from '@latitude-data/web-ui/molecules/TabSelect'
import { useEffect, useMemo } from 'react'
import ConfigurationForm from './ConfigurationForm'
import { EVALUATION_SPECIFICATIONS } from './index'

const EVALUATION_TYPE_OPTIONS = Object.values(EvaluationType).map((type) => {
  const specification = EVALUATION_SPECIFICATIONS[type]
  return {
    label: specification.name,
    value: type,
    icon: specification.icon,
  }
})

const EVALUATION_METRIC_OPTIONS = <
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>(
  type: T,
) => {
  let metrics: M[] = []
  switch (type) {
    case EvaluationType.Rule:
      metrics = Object.values(RuleEvaluationMetric) as M[]
      break
    case EvaluationType.Llm:
      metrics = Object.values(LlmEvaluationMetric).filter(
        (metric) =>
          metric === LlmEvaluationMetric.Custom ||
          !metric.startsWith(LlmEvaluationMetric.Custom),
      ) as M[]
      break
    case EvaluationType.Human:
      metrics = Object.values(HumanEvaluationMetric) as M[]
      break
  }

  return metrics.map((metric) => {
    const specification = EVALUATION_SPECIFICATIONS[type].metrics[metric]
    return {
      label: specification.name,
      value: metric,
      icon: specification.icon,
    }
  })
}

export default function EvaluationV2Form<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  mode,
  settings,
  setSettings,
  options,
  setOptions,
  errors: actionErrors,
  disabled,
  forceTypeChange,
}: {
  mode: 'create' | 'update'
  settings: EvaluationSettings<T, M>
  setSettings: (settings: EvaluationSettings<T, M>) => void
  options: Partial<EvaluationOptions>
  setOptions: (options: Partial<EvaluationOptions>) => void
  errors?: ActionErrors<
    typeof useEvaluationsV2,
    'createEvaluation' | 'updateEvaluation'
  >
  disabled?: boolean
  forceTypeChange?: T
}) {
  const { enabled: evaluationsV2Enabled } = useFeatureFlag({
    featureFlag: 'evaluationsV2',
  })

  // TODO(evalsv2): Temporal hot garbage hack for old evaluation creation modal
  useEffect(() => {
    if (!forceTypeChange) return
    if (forceTypeChange === settings.type) return
    if (mode !== 'create') return
    if (forceTypeChange === EvaluationType.Llm) {
      setSettings({
        ...settings,
        type: forceTypeChange,
        metric: LlmEvaluationMetric.Rating as M,
        configuration: {
          ...settings.configuration,
          reverseScale: false,
          provider: undefined,
          model: undefined,
          criteria:
            'Assess how well the response follows the given instructions.',
          minRating: 1,
          minRatingDescription:
            "Not faithful, doesn't follow the instructions.",
          maxRating: 5,
          maxRatingDescription: 'Very faithful, does follow the instructions.',
          minThreshold: 3,
        },
      })
    } else if (forceTypeChange === EvaluationType.Rule) {
      setSettings({
        ...settings,
        type: forceTypeChange,
        configuration: {
          ...settings.configuration,
          reverseScale: false,
          caseInsensitive: false,
        },
      })
    }
  }, [forceTypeChange])

  const errors = useMemo(() => parseActionErrors(actionErrors), [actionErrors])

  const typeSpecification = EVALUATION_SPECIFICATIONS[settings.type]
  const metricSpecification = typeSpecification?.metrics[settings.metric]

  useEffect(() => {
    if (mode === 'update') return
    if (metricSpecification) return
    setSettings({
      ...settings,
      metric: EVALUATION_METRIC_OPTIONS(settings.type)[0]!.value as M,
    })
  }, [metricSpecification?.ConfigurationForm])

  useEffect(() => {
    if (mode === 'update') return
    if (!metricSpecification) return
    setOptions({
      ...options,
      evaluateLiveLogs: !!metricSpecification.supportsLiveEvaluation,
    })
  }, [metricSpecification?.supportsLiveEvaluation])

  return (
    <form className='min-w-0' id='evaluationV2Form'>
      <FormWrapper>
        {evaluationsV2Enabled && mode === 'create' && (
          <TabSelect
            value={settings.type}
            name='type'
            description={typeSpecification.description}
            options={EVALUATION_TYPE_OPTIONS}
            onChange={(value) => setSettings({ ...settings, type: value as T })}
            errors={errors?.['type']}
            fancy
            disabled={disabled}
            required
          />
        )}
        <Input
          value={settings.name}
          name='name'
          label='Name'
          placeholder='Give your evaluation a name'
          onChange={(e) => setSettings({ ...settings, name: e.target.value })}
          errors={errors?.['name']}
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
          errors={errors?.['description']}
          className='w-full'
          disabled={disabled}
          required
        />
        {mode === 'create' && (
          <Select
            value={
              settings.type === EvaluationType.Llm &&
              settings.metric.startsWith(LlmEvaluationMetric.Custom)
                ? (LlmEvaluationMetric.Custom as M)
                : settings.metric
            }
            name='metric'
            label='Metric'
            description={metricSpecification?.description}
            placeholder='Select an evaluation metric'
            options={EVALUATION_METRIC_OPTIONS(settings.type)}
            onChange={(value) =>
              setSettings({ ...settings, metric: value as M })
            }
            errors={errors?.['metric']}
            disabled={disabled}
            required
          />
        )}
        <ConfigurationForm
          mode={mode}
          type={settings.type}
          metric={settings.metric}
          configuration={settings.configuration}
          setConfiguration={(value) =>
            setSettings({ ...settings, configuration: value })
          }
          settings={settings}
          setSettings={setSettings}
          errors={errors}
          disabled={disabled}
        />
        {mode === 'create' && metricSpecification?.requiresExpectedOutput && (
          <Alert
            variant='default'
            title='This evaluation requires an expected output'
            description='You will configure the column that contains the expected output when you run a batch evaluation'
          />
        )}
        {mode === 'create' && metricSpecification?.supportsManualEvaluation && (
          <Alert
            variant='default'
            title='This evaluation supports manual evaluation'
            description='You will be able to manually evaluate responses in the document logs table'
          />
        )}
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
                errors={errors?.['evaluateLiveLogs']}
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
              errors={errors?.['enableSuggestions']}
              disabled={disabled}
            />
            {/* TODO(exps): Uncomment when experiments are implemented */}
            {/* <SwitchInput
                  checked={!!options.autoApplySuggestions}
                  name='autoApplySuggestions'
                  label='Auto apply suggestions'
                  description='Automatically apply the generated suggestions to your prompt'
                  onCheckedChange={(value) =>
                    setOptions({ ...options, autoApplySuggestions: value })
                  }
                  errors={errors?.['autoApplySuggestions']}
                  disabled={disabled}
                /> */}
          </FormFieldGroup>
        )}
      </FormWrapper>
    </form>
  )
}
