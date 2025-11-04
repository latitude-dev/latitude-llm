'use client'

import {
  EvaluationType,
  RuleEvaluationMetric,
  RuleEvaluationNumericSimilaritySpecification,
} from '@latitude-data/constants'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { NumberInput } from '@latitude-data/web-ui/atoms/NumberInput'
import { useEffect } from 'react'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
} from '../index'

const specification = RuleEvaluationNumericSimilaritySpecification
export default {
  ...specification,
  icon: 'equalApproximately' as IconName,
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
  RuleEvaluationMetric.NumericSimilarity
>) {
  // TODO: Do not set state in useEffects. Move this to an event handler.
  useEffect(() => {
    setConfiguration({ ...configuration, algorithm: 'relative_difference' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <FormFieldGroup
        layout='horizontal'
        description='The minimum and maximum percentage of similarity of the response'
      >
        <NumberInput
          defaultValue={configuration.minSimilarity ?? undefined}
          name='minSimilarity'
          label='Minimum similarity'
          placeholder='No minimum'
          min={0}
          max={100}
          onChange={(value) =>
            setConfiguration({ ...configuration, minSimilarity: value })
          }
          errors={errors?.['minSimilarity']}
          className='w-full'
          disabled={disabled}
          required
        />
        <NumberInput
          defaultValue={configuration.maxSimilarity ?? undefined}
          name='maxSimilarity'
          label='Maximum similarity'
          placeholder='No maximum'
          min={0}
          max={100}
          onChange={(value) =>
            setConfiguration({ ...configuration, maxSimilarity: value })
          }
          errors={errors?.['maxSimilarity']}
          className='w-full'
          disabled={disabled}
          required
        />
      </FormFieldGroup>
    </>
  )
}

function ResultBadge({
  result,
}: ResultBadgeProps<
  EvaluationType.Rule,
  RuleEvaluationMetric.NumericSimilarity
>) {
  return <>{result.score!.toFixed(0)}% similar</>
}

function chartConfiguration({
  evaluation,
}: ChartConfigurationArgs<
  EvaluationType.Rule,
  RuleEvaluationMetric.NumericSimilarity
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
