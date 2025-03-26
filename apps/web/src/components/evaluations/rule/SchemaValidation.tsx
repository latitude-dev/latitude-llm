import {
  EvaluationType,
  RuleEvaluationMetric,
  RuleEvaluationSchemaValidationSpecification,
} from '@latitude-data/constants'
import { IconName, Select, TextArea } from '@latitude-data/web-ui'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
  ResultPanelProps,
  ResultRowCellsProps,
  ResultRowHeadersProps,
} from '../index'

const specification = RuleEvaluationSchemaValidationSpecification
export default {
  ...specification,
  icon: 'clipboardCheck' as IconName,
  ConfigurationForm: ConfigurationForm,
  ResultBadge: ResultBadge,
  ResultRowHeaders: ResultRowHeaders,
  ResultRowCells: ResultRowCells,
  resultPanelTabs: [],
  ResultPanelMetadata: ResultPanelMetadata,
  ResultPanelContent: ResultPanelContent,
  chartConfiguration: chartConfiguration,
}

const FORMAT_OPTIONS = specification.configuration.shape.format.options.map(
  (option) => ({
    label: option.toUpperCase().split('_').join(' '),
    value: option,
  }),
)

function ConfigurationForm({
  configuration,
  setConfiguration,
  disabled,
}: ConfigurationFormProps<
  EvaluationType.Rule,
  RuleEvaluationMetric.SchemaValidation
>) {
  return (
    <>
      <Select
        value={configuration.format ?? ''}
        name='format'
        label='Schema format'
        description='The format of the schema'
        placeholder='Select a schema format'
        options={FORMAT_OPTIONS}
        onChange={(value) =>
          setConfiguration({ ...configuration, format: value })
        }
        disabled={disabled}
        required
      />
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

function ResultRowHeaders(
  _props: ResultRowHeadersProps<
    EvaluationType.Rule,
    RuleEvaluationMetric.SchemaValidation
  >,
) {
  return <></>
}

function ResultRowCells(
  _props: ResultRowCellsProps<
    EvaluationType.Rule,
    RuleEvaluationMetric.SchemaValidation
  >,
) {
  return <></>
}

function ResultPanelMetadata(
  _props: ResultPanelProps<
    EvaluationType.Rule,
    RuleEvaluationMetric.SchemaValidation
  >,
) {
  return <></>
}

function ResultPanelContent(
  _props: ResultPanelProps<
    EvaluationType.Rule,
    RuleEvaluationMetric.SchemaValidation
  >,
) {
  return <></>
}

function chartConfiguration(
  _args: ChartConfigurationArgs<
    EvaluationType.Rule,
    RuleEvaluationMetric.SchemaValidation
  >,
) {
  return {
    min: 0,
    max: 100,
    thresholds: [50] as const,
    scale: (point: number) => Math.min(Math.max(point * 100, 0), 100),
    format: (point: number, short?: boolean) =>
      short ? `${point.toFixed(0)}%` : `${point.toFixed(0)}% valid`,
  }
}
