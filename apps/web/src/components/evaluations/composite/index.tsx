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
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { NumberInput } from '@latitude-data/web-ui/atoms/NumberInput'
import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
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

  const missingLinkedEvaluations = useMemo(() => {
    if (!configuration.defaultTarget) return []

    const missing = []
    const linked = evaluationOptions.filter((e) => e.linked)
    for (const { value: uuid } of linked) {
      if (!configuration.evaluationUuids.includes(uuid)) {
        missing.push(uuid)
      }
    }

    return missing
  }, [
    configuration.defaultTarget,
    evaluationOptions,
    configuration.evaluationUuids,
  ])

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
      {missingLinkedEvaluations.length > 0 && (
        <Alert
          centered
          spacing='xsmall'
          variant='warning'
          description='This composite score is missing some evaluations that are tracking and monitoring issues'
          cta={
            <Button
              variant='outline'
              onClick={() =>
                setConfiguration({
                  ...configuration,
                  evaluationUuids: [
                    ...configuration.evaluationUuids,
                    ...missingLinkedEvaluations,
                  ],
                })
              }
            >
              Add missing evaluations
            </Button>
          }
        />
      )}
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
      <FormFieldGroup
        layout='horizontal'
        description='The minimum and maximum score threshold of the response'
      >
        <NumberInput
          defaultValue={configuration.minThreshold ?? undefined}
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
          defaultValue={configuration.maxThreshold ?? undefined}
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
      <SwitchInput
        checked={configuration.defaultTarget ?? false}
        name='defaultTarget'
        label='Set as default for Optimizations and Distillations'
        description='Optimize and distill more efficient versions of your prompt using this evaluation'
        onCheckedChange={(value) =>
          setConfiguration({ ...configuration, defaultTarget: value })
        }
        errors={errors?.['defaultTarget']}
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
