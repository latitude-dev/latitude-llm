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
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
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
import { ThresholdInput } from '../ThresholdInput'
import CompositeEvaluationAverageSpecification from './Average'
import CompositeEvaluationCustomSpecification from './Custom'
import CompositeEvaluationWeightedSpecification from './Weighted'

// prettier-ignore
const METRICS: {
  [M in CompositeEvaluationMetric]: EvaluationMetricFrontendSpecification<EvaluationType.Composite, M>
} = {
  [CompositeEvaluationMetric.Average]: CompositeEvaluationAverageSpecification,
  [CompositeEvaluationMetric.Weighted]: CompositeEvaluationWeightedSpecification,
  [CompositeEvaluationMetric.Custom]: CompositeEvaluationCustomSpecification,
}

const specification = CompositeEvaluationSpecification
export default {
  ...specification,
  icon: 'blocks' as IconName,
  ConfigurationSimpleForm: ConfigurationSimpleForm,
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
      if (specification.requiresExpectedOutput) continue

      options.push({
        icon: specification.icon,
        value: evaluation.uuid,
        label: evaluation.name,
        linked: !!evaluation.issueId,
      })
    }

    return options
  }, [uuid, evaluations])

  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      <MultiSelectInput
        value={configuration.evaluationUuids ?? []}
        name='evaluationUuids'
        label='Evaluations'
        description='Sub-evaluations to combine the scores from. Only evaluations that do not require an expected output are supported'
        placeholder='Select evaluations'
        options={evaluationOptions}
        onChange={(value) =>
          setConfiguration({ ...configuration, evaluationUuids: value })
        }
        errors={errors?.['evaluationUuids']}
        loading={isLoadingEvaluations}
        disabled={disabled || isLoadingEvaluations}
        required
      />
      {!!metricSpecification.ConfigurationSimpleForm && (
        <metricSpecification.ConfigurationSimpleForm
          uuid={uuid}
          configuration={configuration}
          setConfiguration={setConfiguration}
          errors={errors}
          disabled={disabled}
          {...rest}
        />
      )}
      <ThresholdInput
        threshold={{
          min: configuration.minThreshold ?? undefined,
          max: configuration.maxThreshold ?? undefined,
        }}
        setThreshold={(value) =>
          setConfiguration({
            ...configuration,
            minThreshold: value.min,
            maxThreshold: value.max,
          })
        }
        name='threshold'
        label='threshold'
        description='score threshold of the response'
        min={0}
        max={100}
        showMin={!configuration.reverseScale}
        showMax={configuration.reverseScale}
        errors={errors}
        disabled={disabled}
        required
      />
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
      {!!metricSpecification.ResultPanelMetadata && (
        <metricSpecification.ResultPanelMetadata result={result} {...rest} />
      )}
      {!result.error && (
        <>
          <MetadataItem
            label='Score breakdown'
            contentClassName='pt-1 flex flex-col gap-y-2.5'
            tooltip='The individual normalized scores of the sub-evaluations that were combined (and whether they passed or not)'
            stacked
            collapsible
          >
            {Object.values(result.metadata!.results).map((result) => (
              <div
                key={result.uuid}
                className='w-full flex items-center justify-between gap-x-2 truncate'
              >
                <Text.H6M noWrap ellipsis>
                  {result.name}
                </Text.H6M>
                <Badge
                  variant={result.passed ? 'successMuted' : 'destructiveMuted'}
                >
                  {result.score.toFixed(0)}%
                </Badge>
              </div>
            ))}
          </MetadataItem>
        </>
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
