import {
  type EvaluationType,
  HumanEvaluationBinarySpecification,
  type HumanEvaluationMetric,
} from '@latitude-data/constants'
import type { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { TabSelect } from '@latitude-data/web-ui/molecules/TabSelect'
import { useMemo } from 'react'
import type {
  AnnotationFormProps,
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
} from '../index'

const specification = HumanEvaluationBinarySpecification
export default {
  ...specification,
  icon: 'thumbsUp' as IconName,
  ConfigurationSimpleForm: ConfigurationSimpleForm,
  ResultBadge: ResultBadge,
  AnnotationForm: AnnotationForm,
  chartConfiguration: chartConfiguration,
}

function ConfigurationSimpleForm({
  configuration,
  setConfiguration,
  errors,
  disabled,
}: ConfigurationFormProps<EvaluationType.Human, HumanEvaluationMetric.Binary>) {
  return (
    <>
      <Input
        value={configuration.passDescription ?? ''}
        name='passDescription'
        label='Pass description'
        description='Additional guidelines describing when the response is acceptable'
        placeholder='The response promotes continued interaction'
        onChange={(e) =>
          setConfiguration({
            ...configuration,
            passDescription: e.target.value,
          })
        }
        errors={errors?.passDescription}
        className='w-full'
        disabled={disabled}
        required
      />
      <Input
        value={configuration.failDescription ?? ''}
        name='failDescription'
        label='Fail description'
        description='Additional guidelines describing when the response is not acceptable'
        placeholder='The response discourages interaction'
        onChange={(e) =>
          setConfiguration({
            ...configuration,
            failDescription: e.target.value,
          })
        }
        errors={errors?.failDescription}
        className='w-full'
        disabled={disabled}
        required
      />
    </>
  )
}

function ResultBadge({
  result,
}: ResultBadgeProps<EvaluationType.Human, HumanEvaluationMetric.Binary>) {
  return <>{result.score === 1 ? 'Passed' : 'Failed'}</>
}

function AnnotationForm({
  evaluation,
  resultScore,
  setResultScore,
  disabled,
}: AnnotationFormProps<EvaluationType.Human, HumanEvaluationMetric.Binary>) {
  const options = useMemo(
    () => [
      {
        label: 'Passed',
        value: 1,
        icon: 'thumbsUp',
      },
      {
        label: 'Failed',
        value: 0,
        icon: 'thumbsDown',
      },
    ],
    [],
  )

  const description = useMemo(() => {
    const description = []

    if (evaluation.configuration.passDescription) {
      description.push(`The response should pass when: ${evaluation.configuration.passDescription}`)
    }

    if (evaluation.configuration.failDescription) {
      description.push(`The response should fail when: ${evaluation.configuration.failDescription}`)
    }

    return description.join('. ')
  }, [evaluation.configuration])

  return (
    <TabSelect
      value={resultScore ?? undefined}
      name='resultScore'
      description={description || 'Whether the response passes or fails'}
      options={options}
      onChange={(value) => setResultScore(value)}
      disabled={disabled}
      required
    />
  )
}

function chartConfiguration({
  evaluation,
}: ChartConfigurationArgs<EvaluationType.Human, HumanEvaluationMetric.Binary>) {
  return {
    min: 0,
    max: 100,
    thresholds: {
      lower: evaluation.configuration.reverseScale ? undefined : 50,
      upper: evaluation.configuration.reverseScale ? 50 : undefined,
    },
    scale: (point: number) => Math.min(Math.max(point * 100, 0), 100),
    format: (point: number, short?: boolean) =>
      short ? `${point.toFixed(0)}%` : `${point.toFixed(0)}% passes`,
  }
}
