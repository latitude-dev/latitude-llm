import type { ICommitContextType } from '$/app/providers/CommitProvider'
import { ActionErrors } from '$/hooks/useLatitudeAction'
import {
  CompositeEvaluationMetric,
  DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS,
  EvaluationMetric,
  EvaluationOptions,
  EvaluationSettings,
  EvaluationTriggerTarget,
  EvaluationType,
  HumanEvaluationMetric,
  LAST_INTERACTION_DEBOUNCE_MAX_SECONDS,
  LAST_INTERACTION_DEBOUNCE_MIN_SECONDS,
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
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { TabSelect } from '@latitude-data/web-ui/molecules/TabSelect'
import { StandardSchemaV1 } from '@standard-schema/spec'
import { useEffect, useMemo, useState } from 'react'
import {
  ConfigurationAdvancedForm,
  ConfigurationSimpleForm,
} from './ConfigurationForm'
import { EVALUATION_SPECIFICATIONS } from './index'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'

/**
 * This can be improved by passing specific schemas per type/metric
 * But I'm fed up of fixing zod errors sorry
 */
type EvaluationV2FormSchema = StandardSchemaV1<{
  type: string
  name: string
  description: string
  metric: string
  options: string
  settings: string
  evaluateLiveLogs: string
  'trigger.target': string
  'trigger.lastInteractionDebounce': string
}>

export type EvaluationV2FormErrors = ActionErrors<EvaluationV2FormSchema>

/**
 * Helper: normalize validation errors into a flat map
 */
export function parseActionErrors(errors?: EvaluationV2FormErrors) {
  if (!errors) return {}
  return errors.fieldErrors
}

const EVALUATION_TYPE_OPTIONS = Object.values(EvaluationType)
  .filter((type) => type !== EvaluationType.Composite) // Note: composite evaluations cannot be created from the add modal
  .map((type: EvaluationType) => {
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
    case EvaluationType.Composite:
      metrics = Object.values(CompositeEvaluationMetric) as M[]
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

// FIXME: Settings is a global object passed around which causes terrible
// performance issues.
export default function EvaluationV2Form<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  mode,
  uuid,
  settings,
  setSettings,
  issueId,
  setIssueId,
  options,
  setOptions,
  errors: actionErrors,
  commit,
  disabled,
}: {
  mode: 'create' | 'update'
  uuid?: string
  settings: EvaluationSettings<T, M>
  setSettings: (settings: EvaluationSettings<T, M>) => void
  issueId?: number | null
  setIssueId?: (issueId: number | null) => void
  options: Partial<EvaluationOptions>
  setOptions: (options: Partial<EvaluationOptions>) => void
  errors?: EvaluationV2FormErrors
  commit: ICommitContextType['commit']
  disabled?: boolean
}) {
  const [expanded, setExpanded] = useState(mode === 'update')
  const errors = useMemo(() => parseActionErrors(actionErrors), [actionErrors])

  const typeSpecification = EVALUATION_SPECIFICATIONS[settings.type]
  const metricSpecification = typeSpecification?.metrics[settings.metric]

  useEffect(() => {
    if (mode === 'update') return
    if (metricSpecification) return
    // FIXME: use proper callback setState so that you don't depend on options
    // in the useEffect hook
    setSettings({
      ...settings,
      metric: EVALUATION_METRIC_OPTIONS(settings.type)[0]!.value as M,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricSpecification?.ConfigurationSimpleForm])

  useEffect(() => {
    if (mode === 'update') return
    if (!metricSpecification) return
    // FIXME: use proper callback setState so that you don't depend on options
    // in the useEffect hook
    setOptions({
      ...options,
      evaluateLiveLogs: !!metricSpecification.supportsLiveEvaluation,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricSpecification?.supportsLiveEvaluation])

  const commitMerged = mode === 'update' && !!commit.mergedAt

  return (
    <form className='min-w-0' id='evaluationV2Form'>
      <FormWrapper>
        {mode === 'create' && settings.type !== EvaluationType.Composite && (
          <TabSelect
            value={settings.type}
            name='type'
            description={typeSpecification.description}
            options={EVALUATION_TYPE_OPTIONS}
            onChange={(value) => setSettings({ ...settings, type: value as T })}
            errors={errors?.type}
            fancy
            disabled={disabled || commitMerged}
            required
          />
        )}
        <Input
          value={settings.name}
          name='name'
          label='Name'
          placeholder='Give your evaluation a name'
          onChange={(e) => setSettings({ ...settings, name: e.target.value })}
          errors={errors?.name}
          className='w-full'
          disabled={disabled || commitMerged}
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
          errors={errors?.description}
          className='w-full'
          disabled={disabled || commitMerged}
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
            errors={errors?.metric}
            disabled={disabled || commitMerged}
            required
          />
        )}
        <ConfigurationSimpleForm
          mode={mode}
          uuid={uuid}
          type={settings.type}
          metric={settings.metric}
          configuration={settings.configuration}
          setConfiguration={(value) =>
            setSettings({ ...settings, configuration: value })
          }
          issueId={issueId}
          setIssueId={setIssueId}
          settings={settings}
          setSettings={setSettings}
          errors={errors}
          disabled={disabled || commitMerged}
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
            title='This evaluation supports manual annotation'
            description='You will be able to manually evaluate responses in the runs/logs dashboard or via the API/SDK'
          />
        )}

        <TriggerSettings
          configuration={settings.configuration}
          setConfiguration={(value) =>
            setSettings({ ...settings, configuration: value })
          }
          evaluateLiveLogs={!!options.evaluateLiveLogs}
          errors={errors}
          disabled={disabled || commitMerged}
        />

        {settings.type !== EvaluationType.Composite && (
          <CollapsibleBox
            title='Advanced configuration'
            icon='settings'
            isExpanded={expanded}
            onToggle={setExpanded}
            scrollable={false}
            expandedContent={
              <FormWrapper>
                <ConfigurationAdvancedForm
                  mode={mode}
                  uuid={uuid}
                  type={settings.type}
                  metric={settings.metric}
                  configuration={settings.configuration}
                  setConfiguration={(value) =>
                    setSettings({ ...settings, configuration: value })
                  }
                  issueId={issueId}
                  setIssueId={setIssueId}
                  settings={settings}
                  setSettings={setSettings}
                  errors={errors}
                  disabled={disabled || commitMerged}
                />
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
                      errors={errors?.evaluateLiveLogs}
                      disabled={
                        disabled || !metricSpecification?.supportsLiveEvaluation
                      }
                    />
                  )}
                </FormFieldGroup>
                {metricSpecification?.supportsLiveEvaluation &&
                  !!options.evaluateLiveLogs &&
                  settings.configuration.trigger?.target === 'last' && (
                    <FormFieldGroup
                      label='Response timeout'
                      description='How many seconds to wait after a response has been added to the conversation before considering it the "last response". Used only when evaluating the last response in Live Evaluation mode.'
                      layout='horizontal'
                    >
                      <Input
                        value={
                          settings.configuration.trigger?.lastInteractionDebounce?.toString() ??
                          ''
                        }
                        name='lastInteractionDebounce'
                        type='number'
                        min={LAST_INTERACTION_DEBOUNCE_MIN_SECONDS}
                        max={LAST_INTERACTION_DEBOUNCE_MAX_SECONDS}
                        placeholder={DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS.toString()}
                        onChange={(e) => {
                          const value = parseInt(e.target.value, 10)
                          setSettings({
                            ...settings,
                            configuration: {
                              ...settings.configuration,
                              trigger: {
                                ...settings.configuration.trigger,
                                lastInteractionDebounce: isNaN(value)
                                  ? DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS
                                  : value,
                              },
                            },
                          })
                        }}
                        className='w-full'
                        disabled={disabled}
                        errors={errors?.['trigger.lastInteractionDebounce']}
                      />
                    </FormFieldGroup>
                  )}
              </FormWrapper>
            }
          />
        )}
      </FormWrapper>
    </form>
  )
}

const TRIGGER_TARGET_OPTIONS: Record<
  EvaluationTriggerTarget,
  {
    label: string
    icon?: IconName
  }
> = {
  first: {
    label: 'First response only',
    icon: 'messageSquareText',
  },
  every: {
    label: 'Every response',
    icon: 'messagesSquare',
  },
  last: {
    label: 'Last response only',
    icon: 'messageSquareDashed',
  },
}

function TriggerSettings<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  configuration,
  setConfiguration,
  errors,
  disabled,
}: {
  configuration: EvaluationSettings<T, M>['configuration']
  setConfiguration: (
    configuration: EvaluationSettings<T, M>['configuration'],
  ) => void
  evaluateLiveLogs: boolean
  errors?: Record<string, string[] | undefined>
  disabled?: boolean
}) {
  const triggerTarget = configuration.trigger?.target ?? 'every'

  return (
    <FormFieldGroup
      label='Evaluated responses'
      description='Which assistant responses from the conversation will be evaluated'
      layout='horizontal'
    >
      <Select
        value={triggerTarget}
        name='triggerTarget'
        placeholder='Select responses'
        options={Object.entries(TRIGGER_TARGET_OPTIONS).map(
          ([value, { label, icon }]) => ({
            label,
            value,
            icon,
          }),
        )}
        onChange={(value) =>
          setConfiguration({
            ...configuration,
            trigger: {
              target: value as EvaluationTriggerTarget,
            },
          })
        }
        errors={errors?.['trigger.target']}
        disabled={disabled}
      />
    </FormFieldGroup>
  )
}
