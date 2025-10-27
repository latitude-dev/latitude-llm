'use client'

import {
  CompositeEvaluationAverageSpecification,
  CompositeEvaluationMetric,
  EvaluationType,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { ChartConfigurationArgs, ResultBadgeProps } from '../index'

const specification = CompositeEvaluationAverageSpecification
export default {
  ...specification,
  icon: 'sigma' as IconName,
  ResultBadge: ResultBadge,
  chartConfiguration: chartConfiguration,
}

function ResultBadge({
  result,
}: ResultBadgeProps<
  EvaluationType.Composite,
  CompositeEvaluationMetric.Average
>) {
  return <>{result.score!.toFixed(0)}% met</>
}

function chartConfiguration({
  evaluation,
}: ChartConfigurationArgs<
  EvaluationType.Composite,
  CompositeEvaluationMetric.Average
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
