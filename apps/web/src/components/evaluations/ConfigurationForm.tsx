import { useSerializedLogs } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/(withTabs)/evaluations/[evaluationUuid]/editor/_components/EvaluationEditor/Playground/EvaluationParams/HistoryLogParams/useSerializedLogs'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { ROUTES } from '$/services/routes'
import {
  ACCESSIBLE_OUTPUT_FORMATS,
  type ActualOutputConfiguration,
  type EvaluationMetric,
  type EvaluationType,
  baseEvaluationConfiguration,
} from '@latitude-data/core/browser'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { LineSeparator } from '@latitude-data/web-ui/atoms/LineSeparator'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { MessageList, MessageListSkeleton } from '$/components/ChatWrapper'
import { SelectableSwitch } from '@latitude-data/web-ui/molecules/SelectableSwitch'
import { ClickToCopyUuid } from '@latitude-data/web-ui/organisms/ClickToCopyUuid'
import { useCurrentCommit, useCurrentProject } from '@latitude-data/web-ui/providers'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { type ConfigurationFormProps, EVALUATION_SPECIFICATIONS } from './index'

const MESSAGE_SELECTION_OPTIONS = baseEvaluationConfiguration.shape.actualOutput
  .unwrap()
  .shape.messageSelection.options.map((option) => ({
    label: option.toUpperCase().split('_').join(' '),
    value: option,
  }))

const CONTENT_FILTER_OPTIONS = baseEvaluationConfiguration.shape.actualOutput
  .unwrap()
  .shape.contentFilter.unwrap()
  .options.map((option) => ({
    label: option.toUpperCase().split('_').join(' '),
    value: option,
  }))

const PARSING_FORMAT_OPTIONS = baseEvaluationConfiguration.shape.actualOutput
  .unwrap()
  .shape.parsingFormat.options.map((option) => ({
    label: option.toUpperCase().split('_').join(' '),
    value: option,
  }))

export function ConfigurationSimpleForm<T extends EvaluationType, M extends EvaluationMetric<T>>({
  type,
  metric,
  ...rest
}: ConfigurationFormProps<T, M> & { type: T; metric: M }) {
  const typeSpecification = EVALUATION_SPECIFICATIONS[type]
  if (!typeSpecification) return null

  return <typeSpecification.ConfigurationSimpleForm metric={metric} {...rest} />
}

export function ConfigurationAdvancedForm<T extends EvaluationType, M extends EvaluationMetric<T>>({
  mode,
  type,
  metric,
  configuration,
  setConfiguration,
  errors,
  disabled,
  ...rest
}: ConfigurationFormProps<T, M> & { type: T; metric: M }) {
  const formatIsAccessible = useMemo(
    () =>
      !!configuration.actualOutput?.parsingFormat &&
      ACCESSIBLE_OUTPUT_FORMATS.includes(configuration.actualOutput.parsingFormat),
    [configuration.actualOutput?.parsingFormat],
  )
  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  useEffect(() => {
    if (formatIsAccessible) return
    if (!configuration.actualOutput) return
    // FIXME: use proper callback setState so that you don't depend on options
    // in the useEffect hook
    setConfiguration({
      ...configuration,
      actualOutput: {
        ...(configuration.actualOutput || {}),
        fieldAccessor: undefined,
      },
    })
  }, [formatIsAccessible])

  const [testConfiguration] = useDebounce(configuration.actualOutput, 333)
  const [showTest, setShowTest] = useState(false)

  const typeSpecification = EVALUATION_SPECIFICATIONS[type]
  if (!typeSpecification) return null

  return (
    <>
      {!!typeSpecification.ConfigurationAdvancedForm && (
        <typeSpecification.ConfigurationAdvancedForm
          mode={mode}
          metric={metric}
          configuration={configuration}
          setConfiguration={setConfiguration}
          errors={errors}
          disabled={disabled}
          {...rest}
        />
      )}
      <SelectableSwitch
        selected={!(configuration.reverseScale ?? false)}
        name='reverseScale'
        label='Optimize for'
        trueLabel='Higher score'
        falseLabel='Lower score'
        description='Whether a higher or lower score is better for this evaluation. This will guide the refiner to select the best results when optimizing your prompt'
        onChange={(value) => setConfiguration({ ...configuration, reverseScale: !value })}
        errors={errors?.reverseScale}
        disabled={disabled}
        required
      />
      <FormFieldGroup
        label={
          <span className='w-full flex justify-between items-center gap-2'>
            Actual output
            <Button
              variant='link'
              size='none'
              iconProps={{
                name: showTest ? 'close' : 'arrowDown',
                widthClass: 'w-4',
                heightClass: 'h-4',
                placement: 'right',
              }}
              onClick={(event) => {
                event.preventDefault()
                setShowTest(!showTest)
              }}
            >
              {showTest ? 'Close' : 'Test'}
            </Button>
          </span>
        }
        description='How to extract the output, to evaluate against, from the conversation'
        descriptionPosition='top'
        layout='vertical'
        group
      >
        <FormFieldGroup
          label='Message selection'
          description='Which assistant messages to use'
          layout='horizontal'
        >
          <Select
            value={configuration.actualOutput?.messageSelection ?? 'last'}
            name='messageSelection'
            placeholder='Select an option'
            options={MESSAGE_SELECTION_OPTIONS}
            onChange={(value) =>
              setConfiguration({
                ...configuration,
                actualOutput: {
                  ...(configuration.actualOutput || {}),
                  messageSelection: value,
                },
              })
            }
            errors={errors?.['actualOutput.messageSelection']}
            disabled={disabled}
            required
          />
          <Select
            value={configuration.actualOutput?.contentFilter ?? ''}
            name='contentFilter'
            placeholder='No filter'
            options={CONTENT_FILTER_OPTIONS}
            removable={true}
            onChange={(value) =>
              setConfiguration({
                ...configuration,
                actualOutput: {
                  ...(configuration.actualOutput || {}),
                  contentFilter: value || undefined,
                },
              })
            }
            errors={errors?.['actualOutput.contentFilter']}
            disabled={disabled}
            required
          />
        </FormFieldGroup>
        <FormFieldGroup
          label='Parsing format'
          description='How to parse the assistant messages'
          layout='horizontal'
        >
          <Select
            value={configuration.actualOutput?.parsingFormat ?? 'string'}
            name='parsingFormat'
            placeholder='Select an option'
            options={PARSING_FORMAT_OPTIONS}
            onChange={(value) =>
              setConfiguration({
                ...configuration,
                actualOutput: {
                  ...(configuration.actualOutput || {}),
                  parsingFormat: value,
                },
              })
            }
            errors={errors?.['actualOutput.parsingFormat']}
            disabled={disabled}
            required
          />
          {formatIsAccessible && (
            <Input
              value={configuration.actualOutput?.fieldAccessor ?? ''}
              name='fieldAccessor'
              placeholder='No field'
              onChange={(e) =>
                setConfiguration({
                  ...configuration,
                  actualOutput: {
                    ...(configuration.actualOutput || {}),
                    fieldAccessor: e.target.value || undefined,
                  },
                })
              }
              errors={errors?.['actualOutput.fieldAccessor']}
              className='w-full px-3'
              disabled={disabled || !formatIsAccessible}
              required
            />
          )}
        </FormFieldGroup>
      </FormFieldGroup>
      {showTest && (
        <div className='w-full flex flex-col gap-2 border-t-2 border-dashed border-border pt-4'>
          <ActualOutputTest configuration={testConfiguration} />
        </div>
      )}
    </>
  )
}

function ActualOutputTest({ configuration }: { configuration?: ActualOutputConfiguration }) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const router = useRouter()

  const {
    selectedLog: log,
    isLoadingLog,
    isLoading: isLoadingCount,
    position: logPosition,
    count: totalLogs,
    onNextPage: nextLog,
    onPrevPage: prevLog,
    error,
  } = useSerializedLogs({ document, configuration })

  const isLoading = isLoadingLog || isLoadingCount

  if (isLoading) {
    return (
      <>
        <div className='w-full flex justify-between items-center gap-4'>
          <Skeleton className='w-48 h-5' />
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='icon'
              iconProps={{
                name: 'arrowLeft',
                widthClass: 'w-4',
                heightClass: 'h-4',
              }}
              disabled
            />
            <Button
              variant='outline'
              size='icon'
              iconProps={{
                name: 'arrowRight',
                widthClass: 'w-4',
                heightClass: 'h-4',
              }}
              disabled
            />
          </div>
        </div>
        <div className='w-full flex flex-col gap-2'>
          <div className='w-full max-h-60 custom-scrollbar scrollable-indicator'>
            <MessageListSkeleton messages={3} />
          </div>
          <LineSeparator text='Actual output' />
          <div className='w-full max-h-60 custom-scrollbar scrollable-indicator'>
            <Skeleton className='w-full h-32' />
          </div>
        </div>
      </>
    )
  }

  if (!totalLogs) {
    return (
      <Alert
        variant='warning'
        showIcon={false}
        centered={true}
        description={
          <Text.H5 color='warningMutedForeground' centered>
            No logs generated so far, try the prompt
            <Button
              variant='link'
              size='none'
              iconProps={{
                name: 'arrowRight',
                widthClass: 'w-4',
                heightClass: 'h-4',
                placement: 'right',
              }}
              className='pl-2'
              onClick={(event) => {
                event.preventDefault()
                router.push(
                  ROUTES.projects
                    .detail({ id: project.id })
                    .commits.detail({ uuid: commit.uuid })
                    .documents.detail({ uuid: document.documentUuid }).editor.root,
                )
              }}
            >
              in the playground
            </Button>
          </Text.H5>
        }
      />
    )
  }

  if (logPosition === undefined || totalLogs === undefined) {
    return <Alert variant='destructive' description='Error while fetching logs' />
  }

  if (log === undefined) {
    return (
      <>
        <div className='w-full flex justify-between items-center gap-4'>
          <span className='flex items-center gap-2'>
            <Text.H6B color='foregroundMuted'>
              Log {logPosition} of {totalLogs}
            </Text.H6B>
          </span>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='icon'
              iconProps={{
                name: 'arrowLeft',
                widthClass: 'w-4',
                heightClass: 'h-4',
              }}
              onClick={(event) => {
                event.preventDefault()
                prevLog(logPosition!)
              }}
              disabled={logPosition! <= 1}
            />
            <Button
              variant='outline'
              size='icon'
              iconProps={{
                name: 'arrowRight',
                widthClass: 'w-4',
                heightClass: 'h-4',
              }}
              onClick={(event) => {
                event.preventDefault()
                nextLog(logPosition!)
              }}
              disabled={logPosition! >= totalLogs}
            />
          </div>
        </div>
        <Alert variant='destructive' description={error || 'Error while fetching logs'} />
      </>
    )
  }

  return (
    <>
      <div className='w-full flex justify-between items-center gap-4'>
        <span className='flex items-center gap-2'>
          <Text.H6B color='foregroundMuted'>
            Log {logPosition} of {totalLogs}
          </Text.H6B>
          <ClickToCopyUuid uuid={log.uuid} />
        </span>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='icon'
            iconProps={{
              name: 'arrowLeft',
              widthClass: 'w-4',
              heightClass: 'h-4',
            }}
            onClick={(event) => {
              event.preventDefault()
              prevLog(logPosition!)
            }}
            disabled={logPosition! <= 1}
          />
          <Button
            variant='outline'
            size='icon'
            iconProps={{
              name: 'arrowRight',
              widthClass: 'w-4',
              heightClass: 'h-4',
            }}
            onClick={(event) => {
              event.preventDefault()
              nextLog(logPosition!)
            }}
            disabled={logPosition! >= totalLogs}
          />
        </div>
      </div>
      <div className='w-full flex flex-col gap-2'>
        <div className='w-full max-h-60 custom-scrollbar scrollable-indicator'>
          <MessageList messages={log.messages.all} />
        </div>
        <LineSeparator text='Actual output' />
        <div className='w-full max-h-60 custom-scrollbar scrollable-indicator'>
          <div className='rounded-xl bg-backgroundCode border border-muted-foreground/10 px-4 py-3'>
            <Text.H5 monospace color='foregroundMuted' whiteSpace='preWrap' wordBreak='breakAll'>
              {log.actualOutput}
            </Text.H5>
          </div>
        </div>
      </div>
    </>
  )
}
