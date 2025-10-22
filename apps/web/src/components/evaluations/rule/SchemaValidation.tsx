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

function ConfigurationSimpleForm({
  configuration,
  setConfiguration,
  errors,
  disabled,
}: ConfigurationFormProps<
  EvaluationType.Rule,
  RuleEvaluationMetric.SchemaValidation
>) {
  // TODO: Do not set state in useEffects. Move this to an event handler.
  useEffect(() => {
    setConfiguration({ ...configuration, format: 'json' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
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
