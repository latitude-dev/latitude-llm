import {
  EvaluationSettings,
  EvaluationType,
  EvaluationV2,
  LlmEvaluationCustomLabeledSpecification,
  LlmEvaluationMetric,
} from '@latitude-data/constants'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
} from '../index'
import LlmEvaluationCustomSpecification from './Custom'

const specification = LlmEvaluationCustomLabeledSpecification
export default {
  ...LlmEvaluationCustomSpecification,
  ...specification,
  ConfigurationForm: ConfigurationForm,
  ResultBadge: ResultBadge,
  chartConfiguration: chartConfiguration,
}

function ConfigurationForm({
  settings,
  setSettings,
  ...rest
}: ConfigurationFormProps<
  EvaluationType.Llm,
  LlmEvaluationMetric.CustomLabeled
>) {
  return (
    <LlmEvaluationCustomSpecification.ConfigurationForm
      settings={
        settings as unknown as EvaluationSettings<
          EvaluationType.Llm,
          LlmEvaluationMetric.Custom
        >
      }
      setSettings={
        setSettings as unknown as (
          settings: EvaluationSettings<
            EvaluationType.Llm,
            LlmEvaluationMetric.Custom
          >,
        ) => void
      }
      {...rest}
    />
  )
}

function ResultBadge({
  evaluation,
  ...rest
}: ResultBadgeProps<EvaluationType.Llm, LlmEvaluationMetric.CustomLabeled>) {
  return (
    <LlmEvaluationCustomSpecification.ResultBadge
      evaluation={
        evaluation as unknown as EvaluationV2<
          EvaluationType.Llm,
          LlmEvaluationMetric.Custom
        >
      }
      {...rest}
    />
  )
}

function chartConfiguration({
  evaluation,
  ...rest
}: ChartConfigurationArgs<
  EvaluationType.Llm,
  LlmEvaluationMetric.CustomLabeled
>) {
  return LlmEvaluationCustomSpecification.chartConfiguration({
    evaluation: evaluation as unknown as EvaluationV2<
      EvaluationType.Llm,
      LlmEvaluationMetric.Custom
    >,
    ...rest,
  })
}
