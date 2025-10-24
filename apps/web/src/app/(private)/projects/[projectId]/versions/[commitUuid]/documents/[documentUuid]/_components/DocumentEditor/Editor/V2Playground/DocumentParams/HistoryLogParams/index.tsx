import type { ICommitContextType } from '$/app/providers/CommitProvider'
import type { UseLogHistoryParams } from './useLogHistoryParams'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { ChangeEvent, useCallback, useEffect, useState } from 'react'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { ParametersPaginationNav } from '$/components/ParametersPaginationNav'
import { ParametersWrapper } from '../ParametersWrapper'
import { PlaygroundInput } from '@latitude-data/core/lib/documentPersistedInputs'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import {
  ParameterType,
  PromptSpanMetadata,
  SpanType,
} from '@latitude-data/constants'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { UseDocumentParameters } from '$/hooks/useDocumentParameters'
import { cn } from '@latitude-data/web-ui/utils'
import { useDebouncedCallback } from 'use-debounce'
import { useSpansPaginationStore } from '$/stores/spansPaginationCompat'
import { useSpan } from '$/stores/spans'

function DebouncedTextArea({
  input,
  setInput,
  param,
  disabled,
}: {
  param: string
  input: PlaygroundInput<'history'>
  setInput?: UseDocumentParameters['history']['setInput']
  disabled: boolean
}) {
  const [localValue, setLocalValue] = useState(input.value ?? '')
  const setInputDebounced = useDebouncedCallback(
    async (value: string) => {
      if (!setInput) return
      setInput(param, { ...input, value })
    },
    100,
    { trailing: true },
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
    setLocalValue(input.value ?? '')
  }, [input.value])

  return (
    <TextArea
      name={param}
      value={localValue}
      minRows={1}
      maxRows={6}
      onChange={onChange}
      disabled={disabled}
    />
  )
}

export function HistoryLogParams({
  data,
  commit,
  document,
}: {
  document: DocumentVersion
  commit: ICommitContextType['commit']
  data: UseLogHistoryParams
}) {
  const {
    spans,
    approximateTotalPages,
    currentPage,
    goToNextPage,
    goToPrevPage,
  } = useSpansPaginationStore({
    projectId: String(commit.projectId),
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
    type: SpanType.Prompt,
  })
  const spanId = spans?.[0]?.id
  const traceId = spans?.[0]?.traceId
  const { data: span } = useSpan({
    spanId,
    traceId,
  })

  const hasLogs = spans.length > 0
  const spanPromptMetadata = span?.metadata as PromptSpanMetadata | undefined

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
              {!!span && (
                <Text.H5 ellipsis noWrap>
                  {span?.startedAt.toISOString()}
                </Text.H5>
              )}
            </div>
            <ParametersPaginationNav
              disabled={data.isLoadingLog}
              label='history logs'
              currentIndex={currentPage}
              totalCount={approximateTotalPages}
              onPrevPage={goToPrevPage}
              onNextPage={goToNextPage}
            />
          </>
        ) : (
          <div className='w-full flex justify-center'>
            <Text.H5>No logs found</Text.H5>
          </div>
        )}
      </div>
      <div className={cn({ 'opacity-50': data.isLoading })}>
        <ParametersWrapper document={document} commit={commit}>
          {({ metadataParameters }) =>
            metadataParameters.map((param, idx) => {
              const value = spanPromptMetadata?.parameters?.[param]
              if (!value) return null

              return (
                <div
                  className='grid col-span-2 grid-cols-subgrid gap-3 w-full items-start'
                  key={idx}
                >
                  <div className='flex flex-row items-center gap-x-2 min-h-8'>
                    <Badge variant='accent'>
                      &#123;&#123;{param}&#125;&#125;
                    </Badge>
                  </div>
                  <div className='flex flex-grow w-full min-w-0'>
                    <DebouncedTextArea
                      disabled
                      param={param}
                      input={{
                        value: value as string,
                        metadata: {
                          type: ParameterType.Text,
                          includeInPrompt: true,
                        },
                      }}
                    />
                  </div>
                </div>
              )
            })
          }
        </ParametersWrapper>
      </div>
    </div>
  )
}
