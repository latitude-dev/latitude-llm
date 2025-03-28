'use client'

import {
  EvaluationType,
  RuleEvaluationMetric,
  RuleEvaluationSemanticSimilaritySpecification,
} from '@latitude-data/constants'
import { IconName, NumberInput } from '@latitude-data/web-ui'
import { useEffect } from 'react'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
} from '../index'

const specification = RuleEvaluationSemanticSimilaritySpecification
export default {
  ...specification,
  icon: 'equalApproximately' as IconName,
  ConfigurationForm: ConfigurationForm,
  ResultBadge: ResultBadge,
  chartConfiguration: chartConfiguration,
}

// TODO: Uncomment when more algorithms are implemented
// const ALGORITHM_OPTIONS =
//   specification.configuration.shape.algorithm.options.map((option) => ({
//     label: option.toUpperCase().split('_').join(' '),
//     value: option,
//   }))

function ConfigurationForm({
  configuration,
  setConfiguration,
  errors,
  disabled,
}: ConfigurationFormProps<
  EvaluationType.Rule,
  RuleEvaluationMetric.SemanticSimilarity
>) {
  // TODO: Remove this default when more algorithms are implemented
  useEffect(() => {
    setConfiguration({ ...configuration, algorithm: 'cosine_distance' })
  }, [])

  return (
    <>
      {/* TODO: Uncomment when more algorithms are implemented */}
      {/* <Select
        value={configuration.algorithm ?? ''}
        name='algorithm'
        label='Algorithm'
        description='How to measure similarity'
        placeholder='Select an algorithm'
        options={ALGORITHM_OPTIONS}
        onChange={(value) =>
          setConfiguration({ ...configuration, algorithm: value })
        }
        errors={errors?.['algorithm']}
        disabled={disabled}
        required
      /> */}
      <NumberInput
        value={configuration.minSimilarity ?? undefined}
        name='minSimilarity'
        label='Minimum similarity'
        description='The minimum percentage of similarity of the response'
        placeholder='No minimum'
        min={0}
        max={100}
        onChange={(value) =>
          setConfiguration({ ...configuration, minSimilarity: value })
        }
        errors={errors?.['minSimilarity']}
        defaultAppearance
        className='w-full'
        disabled={disabled}
        required
      />
      <NumberInput
        value={configuration.maxSimilarity ?? undefined}
        name='maxSimilarity'
        label='Maximum similarity'
        description='The maximum percentage of similarity of the response'
        placeholder='No maximum'
        min={0}
        max={100}
        onChange={(value) =>
          setConfiguration({ ...configuration, maxSimilarity: value })
        }
        errors={errors?.['maxSimilarity']}
        defaultAppearance
        className='w-full'
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
