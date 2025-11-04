'use client'

import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { MetadataItem } from '$/components/MetadataItem'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import {
  CompositeEvaluationMetric,
  CompositeEvaluationWeightedSpecification,
  EvaluationType,
} from '@latitude-data/constants'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Label } from '@latitude-data/web-ui/atoms/Label'
import { NumberInput } from '@latitude-data/web-ui/atoms/NumberInput'
import { SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { useMemo } from 'react'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  getEvaluationMetricSpecification,
  ResultBadgeProps,
  ResultPanelProps,
} from '../index'

const specification = CompositeEvaluationWeightedSpecification
export default {
  ...specification,
  icon: 'percent' as IconName,
  ConfigurationSimpleForm: ConfigurationSimpleForm,
  ResultBadge: ResultBadge,
  ResultPanelMetadata: ResultPanelMetadata,
  chartConfiguration: chartConfiguration,
}

function ConfigurationSimpleForm({
  configuration,
  setConfiguration,
  errors,
  disabled,
}: ConfigurationFormProps<
  EvaluationType.Composite,
  CompositeEvaluationMetric.Weighted
>) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const { data: evaluations, isLoading } = useEvaluationsV2({
    project: project,
    commit: commit,
    document: document,
  })
  const evaluationOptions = useMemo(() => {
    const options: Record<string, SelectOption> = {}

    for (const evaluation of evaluations) {
      options[evaluation.uuid] = {
        icon: getEvaluationMetricSpecification(evaluation).icon,
        value: evaluation.uuid,
        label: evaluation.name,
      }
    }

    return options
  }, [evaluations])

  return (
    <>
      <FormFieldGroup
        name='weights'
        label='Score weights'
        description='The custom weight percentage for each sub-evaluation. The sum of all weights must add up to 100%'
        layout='vertical'
        errors={errors?.['weights']}
        group
      >
        {isLoading ? (
          <Skeleton className='w-full h-16 rounded-lg' />
        ) : !configuration.evaluationUuids.length ? (
          <Alert
            variant='warning'
            description='Select at least one sub-evaluation in order to define the weights'
          />
        ) : (
          configuration.evaluationUuids.map((uuid) => (
            <FormFieldGroup key={uuid} layout='horizontal' centered>
              <Label
                variant='default'
                icon={evaluationOptions[uuid].icon as IconName}
                className='w-auto flex-shrink-0 pr-1.5'
                htmlFor={`weights[${uuid}]`}
              >
                {evaluationOptions[uuid].label}
              </Label>
              <NumberInput
                defaultValue={configuration.weights?.[uuid] ?? undefined}
                name={`weights[${uuid}]`}
                placeholder='25%'
                min={0}
                max={100}
                onChange={(value) => {
                  if (value === undefined) return
                  setConfiguration({
                    ...configuration,
                    weights: {
                      ...(configuration.weights ?? {}),
                      [uuid]: value,
                    },
                  })
                }}
                className='w-full'
                disabled={disabled}
                required
              />
            </FormFieldGroup>
          ))
        )}
      </FormFieldGroup>
    </>
  )
}

function ResultBadge({
  result,
}: ResultBadgeProps<
  EvaluationType.Composite,
  CompositeEvaluationMetric.Weighted
>) {
  return <>{result.score!.toFixed(0)}% met</>
}

function ResultPanelMetadata({
  result,
}: ResultPanelProps<
  EvaluationType.Composite,
  CompositeEvaluationMetric.Weighted
>) {
  const weights = useMemo(
    () =>
      Object.entries(result.metadata?.configuration.weights ?? {}).map(
        ([uuid, weight]) => ({
          uuid: uuid,
          name: result.metadata!.results[uuid]!.name,
          weight: weight,
        }),
      ),
    [result.metadata],
  )

  return (
    <>
      {!result.error && (
        <>
          <MetadataItem
            label='Score weights'
            contentClassName='pt-1.5 flex flex-col gap-y-2.5'
            stacked
          >
            <div className='w-full flex items-center justify-start gap-1 overflow-hidden rounded-md'>
              {weights
                .filter(({ weight }) => weight > 0)
                .map(({ uuid, name, weight }) => (
                  <Tooltip
                    key={uuid}
                    asChild
                    trigger={
                      <div
                        className='h-4 border border-accent-foreground/10 rounded-md transition-all hover:opacity-80 cursor-default flex items-center justify-center px-1 truncate'
                        style={{
                          width: `${weight}%`,
                          background: `color-mix(in srgb, hsl(var(--primary)) ${weight}%, hsl(var(--accent)) ${100 - weight}%)`,
                        }}
                      >
                        <Text.H6M
                          color={
                            weight > 25
                              ? 'primaryForeground'
                              : 'accentForeground'
                          }
                          noWrap
                          ellipsis
                        >
                          {name}
                        </Text.H6M>
                      </div>
                    }
                    align='center'
                    side='top'
                  >
                    {name}: {weight.toFixed(0)}%
                  </Tooltip>
                ))}
            </div>
          </MetadataItem>
        </>
      )}
    </>
  )
}

function chartConfiguration({
  evaluation,
}: ChartConfigurationArgs<
  EvaluationType.Composite,
  CompositeEvaluationMetric.Weighted
>) {
  return {
    min: 0,
    max: 100,
    thresholds: {
      lower: evaluation.configuration.minThreshold,
      upper: evaluation.configuration.maxThreshold,
    },
    scale: (point: number) => point,
    format: (point: number, short?: boolean) =>
      short ? `${point.toFixed(0)}%` : `${point.toFixed(0)}% met`,
  }
}
