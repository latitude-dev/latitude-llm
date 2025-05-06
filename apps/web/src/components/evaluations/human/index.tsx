import {
  EvaluationResultMetadata,
  EvaluationType,
  HumanEvaluationMetric,
  HumanEvaluationSpecification,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
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
  ConfigurationForm: ConfigurationForm,
  ResultBadge: ResultBadge,
  AnnotationForm: AnnotationForm,
  chartConfiguration: chartConfiguration,
  metrics: METRICS,
}

function ConfigurationForm<M extends HumanEvaluationMetric>({
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
      <TextArea
        value={configuration.criteria ?? ''}
        name='criteria'
        label='Criteria'
        description='The criteria to judge against'
        placeholder='No criteria'
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
      <metricSpecification.ConfigurationForm
        configuration={configuration}
        setConfiguration={setConfiguration}
        errors={errors}
        disabled={disabled}
        {...rest}
      />
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
  metric,
  evaluation,
  resultMetadata,
  setResultMetadata,
  disabled,
  ...rest
}: AnnotationFormProps<EvaluationType.Human, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      {!!evaluation.configuration.criteria && (
        <div className='flex flex-col gap-y-2'>
          <Text.H6M>
            Criteria: <Text.H6>{evaluation.configuration.criteria}</Text.H6>
          </Text.H6M>
        </div>
      )}
      {!!metricSpecification.AnnotationForm && (
        <metricSpecification.AnnotationForm
          evaluation={evaluation}
          resultMetadata={resultMetadata}
          setResultMetadata={setResultMetadata}
          disabled={disabled}
          {...rest}
        />
      )}
      <TextArea
        value={resultMetadata?.reason ?? ''}
        name='reason'
        label='Reason'
        description='The reasoning for the evaluation decision'
        placeholder='No reason'
        minRows={2}
        maxRows={4}
        onChange={(e) =>
          setResultMetadata({
            ...(resultMetadata ?? {}),
            reason: e.target.value,
          } as Partial<EvaluationResultMetadata<EvaluationType.Human, M>>)
        }
        className='w-full'
        disabled={disabled}
        required
      />
    </>
  )
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
