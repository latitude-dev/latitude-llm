import {
  EvaluationResultV2,
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
  ConfigurationSimpleForm: ConfigurationSimpleForm,
  ConfigurationAdvancedForm: ConfigurationAdvancedForm,
  ResultBadge: ResultBadge,
  chartConfiguration: chartConfiguration,
}

function ConfigurationSimpleForm({
  settings,
  setSettings,
  ...rest
}: ConfigurationFormProps<
  EvaluationType.Llm,
  LlmEvaluationMetric.CustomLabeled
>) {
  return (
    <LlmEvaluationCustomSpecification.ConfigurationSimpleForm
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

function ConfigurationAdvancedForm({
  settings,
  setSettings,
  ...rest
}: ConfigurationFormProps<
  EvaluationType.Llm,
  LlmEvaluationMetric.CustomLabeled
>) {
  return (
    <LlmEvaluationCustomSpecification.ConfigurationAdvancedForm
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
  result,
}: ResultBadgeProps<EvaluationType.Llm, LlmEvaluationMetric.CustomLabeled>) {
  return (
    <LlmEvaluationCustomSpecification.ResultBadge
      evaluation={
        evaluation as unknown as EvaluationV2<
          EvaluationType.Llm,
          LlmEvaluationMetric.Custom
        >
      }
      result={
        result as unknown as EvaluationResultV2<
          EvaluationType.Llm,
          LlmEvaluationMetric.Custom
        >
      }
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
