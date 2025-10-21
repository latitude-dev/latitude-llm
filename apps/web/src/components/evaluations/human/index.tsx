import {
  EvaluationType,
  HumanEvaluationMetric,
  HumanEvaluationSpecification,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import {
  AnnotationFormProps,
  ChartConfigurationArgs,
  ConfigurationFormProps,
  EvaluationMetricFrontendSpecification,
  ResultBadgeProps,
} from '../index'
import HumanEvaluationBinarySpecification from './Binary'
import HumanEvaluationRatingSpecification from './Rating'

// prettier-ignore
const METRICS: {
  [M in HumanEvaluationMetric]: EvaluationMetricFrontendSpecification<EvaluationType.Human, M>
} = {
  [HumanEvaluationMetric.Binary]: HumanEvaluationBinarySpecification,
  [HumanEvaluationMetric.Rating]: HumanEvaluationRatingSpecification,
}

const specification = HumanEvaluationSpecification
export default {
  ...specification,
  icon: 'userRound' as IconName,
  ConfigurationSimpleForm,
  ConfigurationAdvancedForm,
  ResultBadge,
  AnnotationForm,
  chartConfiguration,
  metrics: METRICS,
}

function ConfigurationSimpleForm<M extends HumanEvaluationMetric>({
  metric,
  configuration,
  setConfiguration,
  errors,
  disabled,
  ...rest
}: ConfigurationFormProps<EvaluationType.Human, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      <metricSpecification.ConfigurationSimpleForm
        configuration={configuration}
        setConfiguration={setConfiguration}
        errors={errors}
        disabled={disabled}
        {...rest}
      />
    </>
  )
}

function ConfigurationAdvancedForm<M extends HumanEvaluationMetric>({
  metric,
  configuration,
  setConfiguration,
  errors,
  disabled,
  ...rest
}: ConfigurationFormProps<EvaluationType.Human, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      <SwitchInput
        checked={configuration.enableControls ?? false}
        name='enableControls'
        label='Annotation controls'
        description='Enable controls to annotate responses directly in the runs/logs dashboard'
        onCheckedChange={(value) =>
          setConfiguration({ ...configuration, enableControls: value })
        }
        errors={errors?.['enableControls']}
        disabled={disabled}
        required
      />
      <TextArea
        value={configuration.criteria ?? ''}
        name='criteria'
        label='Additional instructions'
        description='Optional instructions to guide the evaluators on the criteria to judge against'
        placeholder='Judge the engagement of the response'
        minRows={2}
        maxRows={4}
        onChange={(e) =>
          setConfiguration({ ...configuration, criteria: e.target.value })
        }
        errors={errors?.['criteria']}
        className='w-full'
        disabled={disabled}
        required
      />
      {!!metricSpecification.ConfigurationAdvancedForm && (
        <metricSpecification.ConfigurationAdvancedForm
          configuration={configuration}
          setConfiguration={setConfiguration}
          errors={errors}
          disabled={disabled}
          {...rest}
        />
      )}
    </>
  )
}

function ResultBadge<M extends HumanEvaluationMetric>({
  metric,
  ...rest
}: ResultBadgeProps<EvaluationType.Human, M> & {
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

function AnnotationForm<M extends HumanEvaluationMetric>({
  evaluation,
  result,
}: AnnotationFormProps<EvaluationType.Human, M>) {
  const metric = evaluation.metric
  const Form = METRICS[metric]?.AnnotationForm

  if (!Form) return null

  return <Form evaluation={evaluation} result={result} />
}

function chartConfiguration<M extends HumanEvaluationMetric>({
  metric,
  ...rest
}: ChartConfigurationArgs<EvaluationType.Human, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) {
    throw new Error('Invalid evaluation metric')
  }

  return metricSpecification.chartConfiguration(rest)
}
