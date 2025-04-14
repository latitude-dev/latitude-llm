import { MetadataItem } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/MetadataItem'
import { formatCostInMillicents, formatDuration } from '$/app/_lib/formatUtils'
import useModelOptions from '$/hooks/useModelOptions'
import { formatCount } from '$/lib/formatCount'
import useCurrentWorkspace from '$/stores/currentWorkspace'
import useProviders from '$/stores/providerApiKeys'
import {
  EvaluationType,
  LlmEvaluationMetric,
  LlmEvaluationSpecification,
  Providers,
} from '@latitude-data/constants'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { TableCell, TableHead } from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useMemo } from 'react'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  EvaluationMetricFrontendSpecification,
  ResultBadgeProps,
  ResultPanelProps,
  ResultRowCellsProps,
  ResultRowHeadersProps,
} from '../index'
import LlmEvaluationBinarySpecification from './Binary'
import LlmEvaluationComparisonSpecification from './Comparison'
import LlmEvaluationRatingSpecification from './Rating'

// prettier-ignore
const METRICS: {
  [M in LlmEvaluationMetric]: EvaluationMetricFrontendSpecification<EvaluationType.Llm, M>
} = {
  [LlmEvaluationMetric.Binary]: LlmEvaluationBinarySpecification,
  [LlmEvaluationMetric.Rating]: LlmEvaluationRatingSpecification,
  [LlmEvaluationMetric.Comparison]: LlmEvaluationComparisonSpecification,
  [LlmEvaluationMetric.Custom]: undefined as any, // TODO(evalsv2): Implement
}

const specification = LlmEvaluationSpecification
export default {
  ...specification,
  icon: 'bot' as IconName,
  ConfigurationForm: ConfigurationForm,
  ResultBadge: ResultBadge,
  ResultRowHeaders: ResultRowHeaders,
  ResultRowCells: ResultRowCells,
  resultPanelTabs: resultPanelTabs,
  ResultPanelMetadata: ResultPanelMetadata,
  ResultPanelContent: ResultPanelContent,
  chartConfiguration: chartConfiguration,
  metrics: METRICS,
}

function ConfigurationForm<M extends LlmEvaluationMetric>({
  metric,
  configuration,
  setConfiguration,
  errors,
  disabled,
  ...rest
}: ConfigurationFormProps<EvaluationType.Llm, M> & {
  metric: M
}) {
  const { isLoading: isLoadingWorkspace } = useCurrentWorkspace()
  const { data: providers, isLoading: isLoadingProviders } = useProviders()

  const providerOptions = useMemo(
    () => providers.map(({ name }) => ({ label: name, value: name })),
    [providers],
  )
  const selectedProvider = useMemo(
    () => providers.find(({ name }) => name === configuration.provider),
    [providers, configuration.provider],
  )
  const modelOptions = useModelOptions({
    provider: selectedProvider?.provider,
    name: selectedProvider?.name,
  })

  const isLoading = isLoadingWorkspace || isLoadingProviders

  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      <FormFieldGroup
        layout='horizontal'
        description='The provider and model to use when running the evaluation prompt. You can change them in the editor too when using a custom prompt'
      >
        <Select
          value={configuration.provider ?? ''}
          name='provider'
          label='Provider'
          placeholder='Select a provider'
          options={providerOptions}
          onChange={(value) =>
            setConfiguration({ ...configuration, provider: value })
          }
          errors={errors?.['provider']}
          loading={isLoading}
          disabled={disabled || isLoading || !providerOptions.length}
          required
        />
        {selectedProvider?.provider === Providers.Custom ? (
          <Input
            value={configuration.model ?? ''}
            name='model'
            label='Model'
            placeholder='Custom model'
            onChange={(e) =>
              setConfiguration({ ...configuration, model: e.target.value })
            }
            errors={errors?.['model']}
            className='w-full px-3'
            disabled={disabled || isLoading}
            required
          />
        ) : (
          <Select
            value={configuration.model ?? ''}
            name='model'
            label='Model'
            placeholder='Select a model'
            options={modelOptions}
            onChange={(value) =>
              setConfiguration({ ...configuration, model: value })
            }
            errors={errors?.['model']}
            loading={isLoading}
            disabled={disabled || isLoading || !modelOptions.length}
            required
          />
        )}
      </FormFieldGroup>
      <metricSpecification.ConfigurationForm
        configuration={configuration}
        setConfiguration={setConfiguration}
        errors={errors}
        disabled={disabled || isLoading}
        {...rest}
      />
    </>
  )
}

function ResultBadge<M extends LlmEvaluationMetric>({
  metric,
  ...rest
}: ResultBadgeProps<EvaluationType.Llm, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      <metricSpecification.ResultBadge {...rest} />
    </>
  )
}

function ResultRowHeaders<M extends LlmEvaluationMetric>({
  metric,
  ...rest
}: ResultRowHeadersProps<EvaluationType.Llm, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      <TableHead>Cost</TableHead>
      <TableHead>Tokens</TableHead>
      {metricSpecification.ResultRowHeaders ? (
        <metricSpecification.ResultRowHeaders {...rest} />
      ) : (
        <></>
      )}
    </>
  )
}

function ResultRowCells<M extends LlmEvaluationMetric>({
  metric,
  result,
  color,
  ...rest
}: ResultRowCellsProps<EvaluationType.Llm, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      <TableCell>
        {result.error ? (
          <Text.H5 color={color}>-</Text.H5>
        ) : (
          <Text.H5 color={color}>
            {formatCostInMillicents(result.metadata!.cost)}
          </Text.H5>
        )}
      </TableCell>
      <TableCell>
        {result.error ? (
          <Text.H5 color={color}>-</Text.H5>
        ) : (
          <Text.H5 color={color}>
            {formatCount(result.metadata!.tokens)}
          </Text.H5>
        )}
      </TableCell>
      {metricSpecification.ResultRowCells ? (
        <metricSpecification.ResultRowCells
          result={result}
          color={color}
          {...rest}
        />
      ) : (
        <></>
      )}
    </>
  )
}

function resultPanelTabs<M extends LlmEvaluationMetric>({
  metric,
}: {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) {
    throw new Error('Invalid evaluation metric')
  }

  return [...(metricSpecification.resultPanelTabs ?? [])]
}

function ResultPanelMetadata<M extends LlmEvaluationMetric>({
  metric,
  result,
  ...rest
}: ResultPanelProps<EvaluationType.Llm, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      {!result.error && (
        <>
          <MetadataItem
            label='Provider'
            value={result.metadata!.configuration.provider}
          />
          <MetadataItem
            label='Model'
            value={result.metadata!.configuration.model}
          />
          <MetadataItem
            label='Cost'
            value={formatCostInMillicents(result.metadata!.cost)}
            tooltip="We estimate the cost based on the token usage and your provider's pricing. Actual cost may vary."
          />
          <MetadataItem
            label='Tokens'
            value={result.metadata!.tokens.toString()}
          />
          <MetadataItem
            label='Duration'
            value={formatDuration(result.metadata!.duration)}
          />
        </>
      )}
      {metricSpecification.ResultPanelMetadata ? (
        <metricSpecification.ResultPanelMetadata result={result} {...rest} />
      ) : (
        <></>
      )}
    </>
  )
}

function ResultPanelContent<M extends LlmEvaluationMetric>({
  metric,
  ...rest
}: ResultPanelProps<EvaluationType.Llm, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      {metricSpecification.ResultPanelContent ? (
        <metricSpecification.ResultPanelContent {...rest} />
      ) : (
        <></>
      )}
    </>
  )
}

function chartConfiguration<M extends LlmEvaluationMetric>({
  metric,
  ...rest
}: ChartConfigurationArgs<EvaluationType.Llm, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) {
    throw new Error('Invalid evaluation metric')
  }

  return metricSpecification.chartConfiguration(rest)
}
