import { ChangeEvent, useCallback, useEffect, useState } from 'react'
import {
  DocumentVersion,
  EvaluationType,
  EvaluationV2,
  LLM_EVALUATION_PROMPT_PARAMETERS,
  LlmEvaluationMetricAnyCustom,
} from '@latitude-data/core/browser'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { cn } from '@latitude-data/web-ui/utils'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { ICommitContextType } from '@latitude-data/web-ui/providers'
import Link from 'next/link'

import { type UseLogHistoryParams } from './useLogHistoryParams'
import { useDebouncedCallback } from 'use-debounce'
import { usePaginatedDocumentLogUrl } from '$/hooks/playgrounds/usePaginatedDocumentLogUrl'

import {
  type UseEvaluationParameters,
  useEvaluationParameters,
} from '../../../hooks/useEvaluationParamaters'
// TODO: maybe move to common
import { ParametersPaginationNav } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/Playground/DocumentParams/PaginationNav'
import { getEvaluationMetricSpecification } from '$/components/evaluations'

function DebouncedTextArea({
  input,
  setInputs,
  param,
  disabled,
  minRows = 1,
  placeholder = 'Type here...',
}: {
  param: string
  input: string
  setInputs: UseEvaluationParameters['history']['setInputs']
  disabled: boolean
  minRows?: number
  placeholder?: string
}) {
  const [localValue, setLocalValue] = useState(input ?? '')
  const setInputDebounced = useDebouncedCallback(
    async (value: string) => {
      setInputs({ [param]: value })
    },
    100,
    { leading: false, trailing: true },
  )
  const onChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      setLocalValue(value)
      setInputDebounced(value)
    },
    [setInputDebounced],
  )

  useEffect(() => {
    setLocalValue(input ?? '')
  }, [input])

  return (
    <TextArea
      value={localValue}
      minRows={minRows}
      maxRows={6}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
    />
  )
}

function ParameterInput({
  param,
  input,
  setInputs,
  isLoading,
  includedInPrompt,
  minRows,
  placeholder,
}: {
  includedInPrompt: boolean
  param: string
  input: string
  setInputs: UseEvaluationParameters['history']['setInputs']
  isLoading: boolean
  minRows?: number
  placeholder?: string
}) {
  return (
    <div className='grid col-span-2 grid-cols-subgrid gap-3 w-full items-start'>
      <div className='flex flex-row items-center gap-x-2 min-h-8'>
        <Badge variant={includedInPrompt ? 'accent' : 'muted'}>
          &#123;&#123;{param}&#125;&#125;
        </Badge>
        {!includedInPrompt && (
          <Tooltip trigger={<Icon name='info' />}>
            This variable is not included in the current prompt
          </Tooltip>
        )}
      </div>
      <div className='flex flex-grow w-full min-w-0'>
        <DebouncedTextArea
          param={param}
          input={input}
          setInputs={setInputs}
          disabled={isLoading}
          minRows={minRows}
          placeholder={placeholder}
        />
      </div>
    </div>
  )
}

export function HistoryLogParams({
  commit,
  document,
  evaluation,
  data,
}: {
  commit: ICommitContextType['commit']
  document: DocumentVersion
  evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetricAnyCustom>
  data: UseLogHistoryParams
}) {
  const specification = getEvaluationMetricSpecification(evaluation)
  const {
    history: { inputs, setInputs, expectedOutput },
  } = useEvaluationParameters({
    commitVersionUuid: commit.uuid,
    document,
    evaluation,
  })

  const urlData = usePaginatedDocumentLogUrl({
    selectedLog: data.selectedLog,
    page: data.page,
    isLoading: data.isLoadingLog,
  })

  const hasLogs = data.count > 0
  const isLoading = data.isLoading

  return (
    <div className='flex flex-col gap-y-4'>
      <div className='flex flex-row gap-x-4 justify-between items-center border-border border-b pb-4'>
        {data.isLoading || hasLogs ? (
          <>
            <div className='flex flex-grow min-w-0'>
              {data.isLoadingLog ? (
                <div className='flex flex-row gap-x-2 w-full'>
                  <Skeleton height='h3' className='w-2/3' />
                  <Skeleton height='h3' className='w-1/3' />
                </div>
              ) : null}
              {!data.isLoadingLog && urlData ? (
                <Link
                  href={urlData.url}
                  className='flex-grow min-w-0 flex flex-row items-center gap-x-2'
                >
                  <Text.H5 ellipsis noWrap>
                    {urlData.createdAt}
                  </Text.H5>
                  <Badge variant='accent'>{urlData.shortCode}</Badge>
                  <Icon
                    name='externalLink'
                    color='foregroundMuted'
                    className='flex-none'
                  />
                </Link>
              ) : null}
            </div>
            <ParametersPaginationNav
              disabled={data.isLoadingLog}
              label='history logs'
              currentIndex={data.position}
              totalCount={data.count}
              onPrevPage={data.onPrevPage}
              onNextPage={data.onNextPage}
            />
          </>
        ) : (
          <div className='w-full flex justify-center'>
            <Text.H5>No logs found</Text.H5>
          </div>
        )}
      </div>
      <div className={cn({ 'opacity-50': data.isLoading })}>
        <div className='grid grid-cols-[auto_1fr] gap-y-3'>
          {specification.requiresExpectedOutput ? (
            <ParameterInput
              includedInPrompt={expectedOutput.metadata.includedInPrompt}
              input={expectedOutput.value}
              param='expectedOutput'
              setInputs={setInputs}
              isLoading={isLoading}
              placeholder='Put here the expected output to compare with'
              minRows={3}
            />
          ) : null}
          {LLM_EVALUATION_PROMPT_PARAMETERS.map((param, idx) => {
            const input = inputs?.[param]
            const includedInPrompt = input?.metadata?.includedInPrompt ?? true

            if (!input) return null

            return (
              <ParameterInput
                key={idx}
                includedInPrompt={includedInPrompt}
                input={input.value}
                param={param}
                setInputs={setInputs}
                isLoading={isLoading}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
