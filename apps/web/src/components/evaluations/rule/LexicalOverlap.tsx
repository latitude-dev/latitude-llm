import {
  EvaluationType,
  RuleEvaluationLexicalOverlapSpecification,
  RuleEvaluationMetric,
} from '@latitude-data/constants'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { NumberInput } from '@latitude-data/web-ui/atoms/NumberInput'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
} from '../index'

const specification = RuleEvaluationLexicalOverlapSpecification
export default {
  ...specification,
  icon: 'blend' as IconName,
  ConfigurationSimpleForm: ConfigurationSimpleForm,
  ResultBadge: ResultBadge,
  chartConfiguration: chartConfiguration,
}

const ALGORITHM_OPTIONS =
  specification.configuration.shape.algorithm.options.map((option) => ({
    label: option.toUpperCase().split('_').join(' '),
    value: option,
  }))

function ConfigurationSimpleForm({
  configuration,
  setConfiguration,
  errors,
  disabled,
}: ConfigurationFormProps<
  EvaluationType.Rule,
  RuleEvaluationMetric.LexicalOverlap
>) {
  return (
    <>
      <Select
        value={configuration.algorithm ?? ''}
        name='algorithm'
        label='Algorithm'
        description='How to measure overlap'
        placeholder='Select an algorithm'
        options={ALGORITHM_OPTIONS}
        onChange={(value) =>
          setConfiguration({ ...configuration, algorithm: value })
        }
        errors={errors?.['algorithm']}
        disabled={disabled}
        required
      />
      <FormFieldGroup
        layout='horizontal'
        description='The minimum and maximum percentage of overlap of the response'
      >
        <NumberInput
          defaultValue={configuration.minOverlap ?? undefined}
          name='minOverlap'
          label='Minimum overlap'
          placeholder='No minimum'
          min={0}
          max={100}
          onChange={(value) =>
            setConfiguration({ ...configuration, minOverlap: value })
          }
          errors={errors?.['minOverlap']}
          className='w-full'
          disabled={disabled}
          required
        />
        <NumberInput
          defaultValue={configuration.maxOverlap ?? undefined}
          name='maxOverlap'
          label='Maximum overlap'
          placeholder='No maximum'
          min={0}
          max={100}
          onChange={(value) =>
            setConfiguration({ ...configuration, maxOverlap: value })
          }
          errors={errors?.['maxOverlap']}
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
}: ResultBadgeProps<EvaluationType.Rule, RuleEvaluationMetric.LexicalOverlap>) {
  return <>{result.score!.toFixed(0)}% overlap</>
}

function chartConfiguration({
  evaluation,
}: ChartConfigurationArgs<
  EvaluationType.Rule,
  RuleEvaluationMetric.LexicalOverlap
>) {
  return {
    min: 0,
    max: 100,
    thresholds: {
      lower: evaluation.configuration.minOverlap,
      upper: evaluation.configuration.maxOverlap,
    },
    scale: (point: number) => point,
    format: (point: number, short?: boolean) =>
      short ? `${point.toFixed(0)}%` : `${point.toFixed(0)}% overlap`,
  }
}
