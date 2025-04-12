import {
  EvaluationType,
  LlmEvaluationBinarySpecification,
  LlmEvaluationMetric,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
} from '../index'

const specification = LlmEvaluationBinarySpecification
export default {
  ...specification,
  icon: 'thumbsUp' as IconName,
  ConfigurationForm: ConfigurationForm,
  ResultBadge: ResultBadge,
  chartConfiguration: chartConfiguration,
}

function ConfigurationForm({
  configuration,
  setConfiguration,
  errors,
  disabled,
}: ConfigurationFormProps<EvaluationType.Llm, LlmEvaluationMetric.Binary>) {
  return (
    <>
      <TextArea
        value={configuration.criteria ?? ''}
        name='criteria'
        label='Criteria'
        description='The criteria to judge against'
        placeholder='Judge the engagement of the response'
        minRows={2}
        maxRows={4}
        onChange={(e) =>
          setConfiguration({ ...configuration, criteria: e.target.value })
        }
        errors={errors?.['criteria']}
        className='w-full'
        disabled={disabled}
        required
      />
      <Input
        value={configuration.passDescription ?? ''}
        name='passDescription'
        label='Pass description'
        description='When should the response pass?'
        placeholder='The response demonstrates continued interaction'
        onChange={(e) =>
          setConfiguration({
            ...configuration,
            passDescription: e.target.value,
          })
        }
        errors={errors?.['passDescription']}
        className='w-full'
        disabled={disabled}
        required
      />
      <Input
        value={configuration.failDescription ?? ''}
        name='failDescription'
        label='Fail description'
        description='When should the response fail?'
        placeholder='The response discourages interaction'
        onChange={(e) =>
          setConfiguration({
            ...configuration,
            failDescription: e.target.value,
          })
        }
        errors={errors?.['failDescription']}
        className='w-full'
        disabled={disabled}
        required
      />
    </>
  )
}

function ResultBadge({
  result,
}: ResultBadgeProps<EvaluationType.Llm, LlmEvaluationMetric.Binary>) {
  return <>{result.score === 1 ? 'Passed' : 'Failed'}</>
}

function chartConfiguration({
  evaluation,
}: ChartConfigurationArgs<EvaluationType.Llm, LlmEvaluationMetric.Binary>) {
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
