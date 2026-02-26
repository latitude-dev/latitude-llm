import { formatCostInMillicents, formatDuration } from '$/app/_lib/formatUtils'
import { MessageList, MessageListSkeleton } from '$/components/ChatWrapper'
import DebugToggle from '$/components/DebugToggle'
import { MetadataItem } from '$/components/MetadataItem'
import useModelOptions from '$/hooks/useModelOptions'
import { formatCount } from '@latitude-data/constants/formatCount'
import useCurrentWorkspace from '$/stores/currentWorkspace'
import { useConversation } from '$/stores/conversations/useConversation'
import useProviders from '$/stores/providerApiKeys'
import { useTraceWithMessages } from '$/stores/traces'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { Providers } from '@latitude-data/constants'
import {
  EvaluationResultV2,
  EvaluationType,
  LLM_EVALUATION_PROMPT_PARAMETERS,
  LlmEvaluationMetric,
  LlmEvaluationSpecification,
} from '@latitude-data/core/constants'
import { adaptCompletionSpanMessagesToLegacy } from '@latitude-data/core/services/tracing/spans/fetching/findCompletionSpanFromTrace'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { TableCell, TableHead } from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
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
import LlmEvaluationCustomSpecification from './Custom'
import LlmEvaluationCustomLabeledSpecification from './CustomLabeled'
import LlmEvaluationRatingSpecification from './Rating'

// prettier-ignore
const METRICS: {
  [M in LlmEvaluationMetric]: EvaluationMetricFrontendSpecification<EvaluationType.Llm, M>
} = {
  [LlmEvaluationMetric.Binary]: LlmEvaluationBinarySpecification,
  [LlmEvaluationMetric.Rating]: LlmEvaluationRatingSpecification,
  [LlmEvaluationMetric.Comparison]: LlmEvaluationComparisonSpecification,
  [LlmEvaluationMetric.Custom]: LlmEvaluationCustomSpecification,
  [LlmEvaluationMetric.CustomLabeled]: LlmEvaluationCustomLabeledSpecification,
}

const specification = LlmEvaluationSpecification
export default {
  ...specification,
  icon: 'bot' as IconName,
  ConfigurationSimpleForm: ConfigurationSimpleForm,
  ConfigurationAdvancedForm: ConfigurationAdvancedForm,
  ResultBadge: ResultBadge,
  ResultRowHeaders: ResultRowHeaders,
  ResultRowCells: ResultRowCells,
  resultPanelTabs: resultPanelTabs,
  ResultPanelMetadata: ResultPanelMetadata,
  ResultPanelContent: ResultPanelContent,
  chartConfiguration: chartConfiguration,
  metrics: METRICS,
}

function ConfigurationSimpleForm<M extends LlmEvaluationMetric>({
  mode,
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

  const hasEditor = metric.startsWith(LlmEvaluationMetric.Custom)
  const isLoading = isLoadingWorkspace || isLoadingProviders
  const isDisabled = disabled || isLoading || (mode !== 'create' && hasEditor)

  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      <FormFieldGroup
        layout='horizontal'
        description={`The provider and model to use when running the evaluation prompt${mode !== 'create' && hasEditor ? '. You must change them in the editor when using a custom prompt' : ''}`}
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
          disabled={isDisabled || !providerOptions.length}
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
            disabled={isDisabled}
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
            disabled={isDisabled || !modelOptions.length}
            required
          />
        )}
      </FormFieldGroup>
      {!!metricSpecification.ConfigurationSimpleForm && (
        <metricSpecification.ConfigurationSimpleForm
          mode={mode}
          configuration={configuration}
          setConfiguration={setConfiguration}
          errors={errors}
          disabled={disabled || isLoading}
          {...rest}
        />
      )}
    </>
  )
}

function ConfigurationAdvancedForm<M extends LlmEvaluationMetric>({
  metric,
  ...rest
}: ConfigurationFormProps<EvaluationType.Llm, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      {!!metricSpecification.ConfigurationAdvancedForm && (
        <metricSpecification.ConfigurationAdvancedForm {...rest} />
      )}
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
      {!!metricSpecification.ResultRowHeaders && (
        <metricSpecification.ResultRowHeaders {...rest} />
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
      {!!metricSpecification.ResultRowCells && (
        <metricSpecification.ResultRowCells
          result={result}
          color={color}
          {...rest}
        />
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

  return [
    { label: 'Messages', value: 'messages' },
    ...(metricSpecification.resultPanelTabs ?? []),
  ]
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
      {!!metricSpecification.ResultPanelMetadata && (
        <metricSpecification.ResultPanelMetadata result={result} {...rest} />
      )}
    </>
  )
}

function ResultPanelContent<M extends LlmEvaluationMetric>({
  metric,
  result,
  selectedTab,
  ...rest
}: ResultPanelProps<EvaluationType.Llm, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      {selectedTab === 'messages' && <ResultPanelMessages result={result} />}
      {!!metricSpecification.ResultPanelContent && (
        <metricSpecification.ResultPanelContent
          result={result}
          selectedTab={selectedTab}
          {...rest}
        />
      )}
    </>
  )
}

function ResultPanelMessages<M extends LlmEvaluationMetric>({
  result,
}: {
  result: EvaluationResultV2<EvaluationType.Llm, M>
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const { traces, isLoading: isLoadingTraces } = useConversation({
    conversationId: result.uuid,
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
  })

  const { traceId, spanId } = useMemo(() => {
    const trace = traces[0]
    if (!trace) return { traceId: null, spanId: null }
    const firstSpan = trace.children[0]
    return { traceId: trace.id, spanId: firstSpan?.id ?? null }
  }, [traces])

  const { completionSpan, isLoading: isLoadingMessages } = useTraceWithMessages(
    { traceId, spanId },
  )

  const messages = useMemo(
    () => adaptCompletionSpanMessagesToLegacy(completionSpan ?? undefined),
    [completionSpan],
  )

  const sourceMapAvailable = useMemo(
    () =>
      messages.some((message) => {
        if (typeof message.content !== 'object') return false
        return message.content.some((content) => '_promptlSourceMap' in content)
      }),
    [messages],
  )

  const { value: debugMode, setValue: setDebugMode } = useLocalStorage({
    key: AppLocalStorage.chatDebugMode,
    defaultValue: false,
  })

  if (result.error) {
    return (
      <div className='w-full flex items-center justify-center'>
        <Text.H5 color='foregroundMuted' centered>
          There are no logs for this evaluation result
        </Text.H5>
      </div>
    )
  }

  if (isLoadingTraces || isLoadingMessages) {
    return (
      <div className='w-full flex flex-col items-center justify-center gap-2'>
        <div className='w-full flex items-center justify-between'>
          <Text.H6M>Messages</Text.H6M>
          <Skeleton className='w-20 h-4' />
        </div>
        <MessageListSkeleton messages={3} />
      </div>
    )
  }

  if (!messages.length) {
    return (
      <div className='w-full flex items-center justify-center'>
        <Text.H5 color='foregroundMuted' centered>
          There are no messages generated for this evaluation log
        </Text.H5>
      </div>
    )
  }

  return (
    <>
      <div className='flex flex-row items-center justify-between w-full sticky top-0 bg-background pb-2'>
        <Text.H6M>Messages</Text.H6M>
        {sourceMapAvailable && (
          <div className='flex flex-row gap-2 items-center'>
            <DebugToggle enabled={debugMode} setEnabled={setDebugMode} />
          </div>
        )}
      </div>
      <MessageList
        messages={messages}
        parameters={LLM_EVALUATION_PROMPT_PARAMETERS as unknown as string[]}
        debugMode={debugMode}
      />
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
