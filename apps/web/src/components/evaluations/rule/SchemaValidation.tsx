'use client'

import {
  EvaluationType,
  RuleEvaluationMetric,
  RuleEvaluationSchemaValidationSpecification,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { useEffect } from 'react'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
} from '../index'

const specification = RuleEvaluationSchemaValidationSpecification
export default {
  ...specification,
  icon: 'braces' as IconName,
  ConfigurationSimpleForm: ConfigurationSimpleForm,
  ResultBadge: ResultBadge,
  chartConfiguration: chartConfiguration,
}

// TODO: Uncomment when more formats are implemented
// const FORMAT_OPTIONS = specification.configuration.shape.format.options.map(
//   (option) => ({
//     label: option.toUpperCase().split('_').join(' '),
//     value: option,
//   }),
// )

function ConfigurationSimpleForm({
  configuration,
  setConfiguration,
  errors,
  disabled,
}: ConfigurationFormProps<
  EvaluationType.Rule,
  RuleEvaluationMetric.SchemaValidation
>) {
  // TODO: Remove this default when more formats are implemented
  useEffect(() => {
    setConfiguration({ ...configuration, format: 'json' })
  }, [])

  return (
    <>
      {/* TODO: Uncomment when more formats are implemented */}
      {/* <Select
        value={configuration.format ?? ''}
        name='format'
        label='Schema format'
        description='The format of the schema'
        placeholder='Select a schema format'
        options={FORMAT_OPTIONS}
        onChange={(value) =>
          setConfiguration({ ...configuration, format: value })
        }
        errors={errors?.['format']}
        disabled={disabled}
        required
      /> */}
      <TextArea
        value={configuration.schema ?? ''}
        name='schema'
        label={
          configuration.format
            ? `${configuration.format.toUpperCase().split('_').join(' ')} schema`
            : 'Schema'
        }
        description='The schema to validate against'
        placeholder='{ "type": "object" }'
        onChange={(e) =>
          setConfiguration({ ...configuration, schema: e.target.value })
        }
        errors={errors?.['schema']}
        minRows={3}
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
  RuleEvaluationMetric.SchemaValidation
>) {
  return <>{result.score === 1 ? 'Valid' : 'Invalid'}</>
}

function chartConfiguration({
  evaluation,
}: ChartConfigurationArgs<
  EvaluationType.Rule,
  RuleEvaluationMetric.SchemaValidation
>) {
  return {
    min: 0,
    max: 100,
    thresholds: {
      lower: evaluation.configuration.reverseScale ? undefined : 50,
      upper: evaluation.configuration.reverseScale ? 50 : undefined,
    },
    scale: (point: number) => Math.min(Math.max(point * 100, 0), 100),
    format: (point: number, short?: boolean) =>
      short ? `${point.toFixed(0)}%` : `${point.toFixed(0)}% valid`,
  }
}
