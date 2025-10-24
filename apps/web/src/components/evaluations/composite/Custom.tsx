'use client'

import {
  CompositeEvaluationCustomSpecification,
  CompositeEvaluationMetric,
  EvaluationType,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
} from '../index'

const specification = CompositeEvaluationCustomSpecification
export default {
  ...specification,
  icon: 'code' as IconName,
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
  EvaluationType.Composite,
  CompositeEvaluationMetric.Custom
>) {
  // TODO(AO): Put more info in the description
  // TODO(AO): Display formula with uuids substituded by evaluation names and send them with the uuids too!
  return (
    <>
      <Input
        value={configuration.formula ?? ''}
        name='formula'
        label='Formula expression'
        description='The formula to combine the scores with'
        placeholder='(eval1 + eval2) / results'
        onChange={(e) =>
          setConfiguration({ ...configuration, formula: e.target.value })
        }
        errors={errors?.['formula']}
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
  EvaluationType.Composite,
  CompositeEvaluationMetric.Custom
>) {
  return <>{result.score!.toFixed(0)}% met</>
}

function chartConfiguration({
  evaluation,
}: ChartConfigurationArgs<
  EvaluationType.Composite,
  CompositeEvaluationMetric.Custom
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
