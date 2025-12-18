import { useEffect, useMemo, useState } from 'react'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { MessageList, MessageListSkeleton } from '$/components/ChatWrapper'
import { ROUTES } from '$/services/routes'
import { useIssue } from '$/stores/issues/issue'
import { useSearchIssues } from '$/stores/issues/selectorIssues'
import {
  ACCESSIBLE_OUTPUT_FORMATS,
  ActualOutputConfiguration,
  baseEvaluationConfiguration,
  EvaluationMetric,
  EvaluationType,
  ISSUE_GROUP,
} from '@latitude-data/core/constants'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { LineSeparator } from '@latitude-data/web-ui/atoms/LineSeparator'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { SelectableSwitch } from '@latitude-data/web-ui/molecules/SelectableSwitch'
import { ClickToCopyUuid } from '@latitude-data/web-ui/organisms/ClickToCopyUuid'
import { useDebounce, useDebouncedCallback } from 'use-debounce'
import { ConfigurationFormProps, EVALUATION_SPECIFICATIONS } from './index'
import { useNavigate } from '$/hooks/useNavigate'
import { useEvaluatedTraces } from './useEvaluatedTraces'

const MESSAGE_SELECTION_OPTIONS =
  baseEvaluationConfiguration.shape.actualOutput.shape.messageSelection.options.map(
    (option) => ({
      label: option.toUpperCase().split('_').join(' '),
      value: option,
    }),
  )

const CONTENT_FILTER_OPTIONS =
  baseEvaluationConfiguration.shape.actualOutput.shape.contentFilter
    .unwrap()
    .options.map((option) => ({
      label: option.toUpperCase().split('_').join(' '),
      value: option,
    }))

const PARSING_FORMAT_OPTIONS =
  baseEvaluationConfiguration.shape.actualOutput.shape.parsingFormat.options.map(
    (option) => ({
      label: option.toUpperCase().split('_').join(' '),
      value: option,
    }),
  )

export function ConfigurationSimpleForm<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  type,
  metric,
  ...rest
}: ConfigurationFormProps<T, M> & { type: T; metric: M }) {
  const typeSpecification = EVALUATION_SPECIFICATIONS[type]
  if (!typeSpecification) return null

  return (
    <>
      {!!typeSpecification.ConfigurationSimpleForm && (
        <typeSpecification.ConfigurationSimpleForm metric={metric} {...rest} />
      )}
    </>
  )
}

export function ConfigurationAdvancedForm<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  mode,
  type,
  metric,
  configuration,
  setConfiguration,
  setIssueId,
  issueId,
  errors,
  disabled,
  ...rest
}: ConfigurationFormProps<T, M> & { type: T; metric: M }) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const [query, setQuery] = useState('')
  const onSearch = useDebouncedCallback((value: string) => {
    setQuery(value)
  }, 500)
  const formatIsAccessible = useMemo(
    () =>
      !!configuration.actualOutput?.parsingFormat &&
      ACCESSIBLE_OUTPUT_FORMATS.includes(
        configuration.actualOutput.parsingFormat,
      ),
    [configuration.actualOutput?.parsingFormat],
  )

  const { data: selectedIssue, isLoading: isLoadingSelectedIssue } = useIssue({
    projectId: project.id,
    commitUuid: commit.uuid,
    issueId,
  })

  const { data: issues, isLoading: isLoadingIssues } = useSearchIssues({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
    query,
    group: ISSUE_GROUP.active,
  })

  const options = useMemo(() => {
    const list = issues.map((issue) => ({
      label: issue.title,
      value: issue.id,
    }))

    if (selectedIssue) {
      const exists = list.find((item) => item.value === selectedIssue.id)
      if (!exists) {
        list.unshift({
          label: selectedIssue.title,
          value: selectedIssue.id,
        })
      }
    }
    return list
  }, [issues, selectedIssue])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatIsAccessible])

  const [testConfiguration] = useDebounce(configuration.actualOutput, 750)
  const [showTest, setShowTest] = useState(false)

  const typeSpecification = EVALUATION_SPECIFICATIONS[type]
  if (!typeSpecification) return null

  const metricSpecification = typeSpecification.metrics[metric]
  if (!metricSpecification) return null

  const canAssignIssue =
    type !== EvaluationType.Composite &&
    !metricSpecification.requiresExpectedOutput &&
    metricSpecification.supportsLiveEvaluation

  return (
    <>
      {!!typeSpecification.ConfigurationAdvancedForm && (
        <typeSpecification.ConfigurationAdvancedForm
          mode={mode}
          metric={metric}
          configuration={configuration}
          setConfiguration={setConfiguration}
          issueId={issueId}
          setIssueId={setIssueId}
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
        onChange={(value) =>
          setConfiguration({ ...configuration, reverseScale: !value })
        }
        errors={errors?.['reverseScale']}
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
                setShowTest(!showTest && !!configuration.actualOutput)
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
          description='Which assistant messages to use. Messages with multiple content are flattened into individual ones'
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
          tooltip={
            formatIsAccessible ? (
              <Text.H6 color='background'>
                Use a field accessor to extract a specific field from the output
                using dot notation.
                <br />
                <br />
                - Access a field: arguments, arguments.options (nested)
                <br />- Access a list: [0] (first), [-1] (last)
                <br />- Combine both: [0].arguments.options[-1]
              </Text.H6>
            ) : undefined
          }
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
      {showTest && !!configuration.actualOutput && (
        <div className='w-full flex flex-col gap-2 border-t-2 border-dashed border-border pt-4'>
          <ActualOutputTest configuration={testConfiguration} />
        </div>
      )}
      {canAssignIssue && (
        <FormFieldGroup
          label='Linked issue'
          description='Track and monitor an issue using failing results from this evaluation'
          layout='horizontal'
        >
          <Select
            searchable
            removable
            value={selectedIssue?.id}
            name='issueId'
            placeholder='Select an issue'
            searchPlaceholder='Search issues...'
            loading={isLoadingIssues || isLoadingSelectedIssue}
            disabled={disabled || isLoadingIssues || isLoadingSelectedIssue}
            options={options}
            onSearch={onSearch}
            onChange={(value) => setIssueId?.(value ?? null)}
            errors={errors?.['issueId']}
          />
        </FormFieldGroup>
      )}
    </>
  )
}

function ActualOutputTest({
  configuration,
}: {
  configuration: ActualOutputConfiguration
}) {
  const router = useNavigate()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const {
    selectedTrace,
    isLoading,
    onNextPage,
    hasNextPage,
    onPrevPage,
    hasPrevPage,
  } = useEvaluatedTraces({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
    configuration,
  })

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

  if (!isLoading && !selectedTrace) {
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
                    .documents.detail({ uuid: document.documentUuid }).editor
                    .root,
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

  const trace = selectedTrace!

  return (
    <>
      <div className='w-full flex justify-between items-center gap-4'>
        {trace.documentLogUuid ? (
          <span className='flex items-center gap-2'>
            <ClickToCopyUuid uuid={trace.documentLogUuid} />
          </span>
        ) : null}
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
              onPrevPage()
            }}
            disabled={!hasPrevPage}
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
              onNextPage()
            }}
            disabled={!hasNextPage}
          />
        </div>
      </div>
      <div className='min-w-0 flex flex-col gap-2'>
        <div className='flex min-w-0 max-h-60 custom-scrollbar scrollable-indicator'>
          <MessageList messages={trace.messages} debugMode />
        </div>
        <LineSeparator text='Actual output' />
        <div className='w-full max-h-60 custom-scrollbar scrollable-indicator'>
          <div className='rounded-xl bg-backgroundCode border border-muted-foreground/10 px-4 py-3'>
            <Text.H5
              monospace
              color='foregroundMuted'
              whiteSpace='preWrap'
              wordBreak='breakAll'
            >
              {trace.actualOutput}
            </Text.H5>
          </div>
        </div>
      </div>
    </>
  )
}
