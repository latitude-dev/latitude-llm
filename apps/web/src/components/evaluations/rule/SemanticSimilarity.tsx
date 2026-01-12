'use client'

import {
  EvaluationType,
  RuleEvaluationMetric,
  RuleEvaluationSemanticSimilaritySpecification,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { useEffect } from 'react'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
} from '../index'
import { ThresholdInput } from '../ThresholdInput'

const specification = RuleEvaluationSemanticSimilaritySpecification
export default {
  ...specification,
  icon: 'aLargeSmall' as IconName,
  ConfigurationSimpleForm: ConfigurationSimpleForm,
  ResultBadge: ResultBadge,
  chartConfiguration: chartConfiguration,
}

function ConfigurationSimpleForm({
  configuration,
  setConfiguration,
  errors,
  disabled,
}: ConfigurationFormProps<
  EvaluationType.Rule,
  RuleEvaluationMetric.SemanticSimilarity
>) {
  // TODO: Do not set state in useEffects. Move this to an event handler.
  useEffect(() => {
    setConfiguration({ ...configuration, algorithm: 'cosine_distance' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <ThresholdInput
        threshold={{
          min: configuration.minSimilarity ?? undefined,
          max: configuration.maxSimilarity ?? undefined,
        }}
        setThreshold={(value) =>
          setConfiguration({
            ...configuration,
            minSimilarity: value.min,
            maxSimilarity: value.max,
          })
        }
        name='similarity'
        label='similarity'
        description='percentage of similarity of the response'
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

function ResultBadge({
  result,
}: ResultBadgeProps<
  EvaluationType.Rule,
  RuleEvaluationMetric.SemanticSimilarity
>) {
  return <>{result.score!.toFixed(0)}% similar</>
}

function chartConfiguration({
  evaluation,
}: ChartConfigurationArgs<
  EvaluationType.Rule,
  RuleEvaluationMetric.SemanticSimilarity
>) {
  return {
    min: 0,
    max: 100,
    thresholds: {
      lower: evaluation.configuration.minSimilarity,
      upper: evaluation.configuration.maxSimilarity,
    },
    scale: (point: number) => point,
    format: (point: number, short?: boolean) =>
      short ? `${point.toFixed(0)}%` : `${point.toFixed(0)}% similar`,
  }
}
