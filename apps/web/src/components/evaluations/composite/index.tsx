import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { MetadataItem } from '$/components/MetadataItem'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import {
  CompositeEvaluationMetric,
  CompositeEvaluationSpecification,
  EvaluationType,
} from '@latitude-data/constants'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { NumberInput } from '@latitude-data/web-ui/atoms/NumberInput'
import { MultiSelectInput } from '@latitude-data/web-ui/molecules/MultiSelectInput'
import { useMemo } from 'react'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  EvaluationMetricFrontendSpecification,
  ResultBadgeProps,
  ResultPanelProps,
  getEvaluationMetricSpecification,
} from '../index'
import CompositeEvaluationCustomSpecification from './Custom'

// prettier-ignore
const METRICS: {
  [M in CompositeEvaluationMetric]: EvaluationMetricFrontendSpecification<EvaluationType.Composite, M>
} = {
  [CompositeEvaluationMetric.Custom]: CompositeEvaluationCustomSpecification,
}

const specification = CompositeEvaluationSpecification
export default {
  ...specification,
  icon: 'blocks' as IconName,
  ConfigurationSimpleForm: ConfigurationSimpleForm,
  ConfigurationAdvancedForm: ConfigurationAdvancedForm,
  ResultBadge: ResultBadge,
  ResultPanelMetadata: ResultPanelMetadata,
  chartConfiguration: chartConfiguration,
  metrics: METRICS,
}

function ConfigurationSimpleForm<M extends CompositeEvaluationMetric>({
  metric,
  uuid,
  configuration,
  setConfiguration,
  errors,
  disabled,
  ...rest
}: ConfigurationFormProps<EvaluationType.Composite, M> & {
  metric: M
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const { data: evaluations, isLoading: isLoadingEvaluations } =
    useEvaluationsV2({ project, commit, document })
  const evaluationOptions = useMemo(() => {
    const options = []

    for (const evaluation of evaluations) {
      if (evaluation.uuid === uuid) continue
      if (evaluation.deletedAt) continue

      const specification = getEvaluationMetricSpecification(evaluation)
      if (!specification.supportsBatchEvaluation) continue

      options.push({
        icon: specification.icon,
        value: evaluation.uuid,
        label: evaluation.name,
      })
    }

    return options
  }, [uuid, evaluations])

  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      {/* TODO(AO): UI to set evaluationUuids */}
      <MultiSelectInput
        value={configuration.evaluationUuids ?? []}
        name='evaluationUuids'
        label='Evaluations'
        description='TODO(AO): Add description'
        placeholder='Select evaluations'
        options={evaluationOptions}
        onChange={(value) =>
          setConfiguration({ ...configuration, evaluationUuids: value })
        }
        errors={errors?.['evaluationUuids']}
        loading={isLoadingEvaluations}
        disabled={disabled}
        required
      />
      <metricSpecification.ConfigurationSimpleForm
        uuid={uuid}
        configuration={configuration}
        setConfiguration={setConfiguration}
        errors={errors}
        disabled={disabled}
        {...rest}
      />
      <FormFieldGroup
        layout='horizontal'
        description='The minimum and maximum score threshold of the response'
      >
        <NumberInput
          value={configuration.minThreshold ?? undefined}
          name='minThreshold'
          label='Minimum threshold'
          placeholder='No minimum'
          min={0}
          max={100}
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
          min={0}
          max={100}
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

function ConfigurationAdvancedForm<M extends CompositeEvaluationMetric>({
  metric,
  ...rest
}: ConfigurationFormProps<EvaluationType.Composite, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      {!!metricSpecification.ConfigurationAdvancedForm && (
        <metricSpecification.ConfigurationAdvancedForm {...rest} />
      )}
    </>
  )
}

function ResultBadge<M extends CompositeEvaluationMetric>({
  metric,
  ...rest
}: ResultBadgeProps<EvaluationType.Composite, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      <metricSpecification.ResultBadge {...rest} />
    </>
  )
}

function ResultPanelMetadata<M extends CompositeEvaluationMetric>({
  metric,
  result,
  ...rest
}: ResultPanelProps<EvaluationType.Composite, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      {!result.error && (
        <>
          <MetadataItem
            label='Results by evaluation'
            value='TODO(AO): Add results by evaluation'
          />
        </>
      )}
      {!!metricSpecification.ResultPanelMetadata && (
        <metricSpecification.ResultPanelMetadata result={result} {...rest} />
      )}
    </>
  )
}

function chartConfiguration<M extends CompositeEvaluationMetric>({
  metric,
  ...rest
}: ChartConfigurationArgs<EvaluationType.Composite, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) {
    throw new Error('Invalid evaluation metric')
  }

  return metricSpecification.chartConfiguration(rest)
}
