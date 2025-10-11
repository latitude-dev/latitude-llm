import {
  UseDocumentParameters,
  useDocumentParameters,
} from '$/hooks/useDocumentParameters'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { cn } from '@latitude-data/web-ui/utils'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { ICommitContextType } from '@latitude-data/web-ui/providers'
import Link from 'next/link'

import { type UseLogHistoryParamsKeyset } from './useLogHistoryParamsKeyset'
import {
  asPromptLFile,
  PromptLFileParameter,
} from '$/components/PromptLFileParameter'
import { ChangeEvent, useCallback, useEffect, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { ParametersWrapper } from '../ParametersWrapper'
import { usePaginatedDocumentLogUrl } from '$/hooks/playgrounds/usePaginatedDocumentLogUrl'
import { ParametersPaginationNav } from '$/components/ParametersPaginationNav'
import { DocumentVersion } from '@latitude-data/core/schema/types'
import { PlaygroundInput } from '@latitude-data/core/lib/documentPersistedInputs'

function DebouncedTextArea({
  input,
  setInput,
  param,
  disabled,
}: {
  param: string
  input: PlaygroundInput<'history'>
  setInput: UseDocumentParameters['history']['setInput']
  disabled: boolean
}) {
  const [localValue, setLocalValue] = useState(input.value ?? '')
  const setInputDebounced = useDebouncedCallback(
    async (value: string) => {
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

export function HistoryLogParamsKeyset({
  data,
  commit,
  document,
}: {
  document: DocumentVersion
  commit: ICommitContextType['commit']
  data: UseLogHistoryParamsKeyset
}) {
  const {
    history: { inputs, setInput },
  } = useDocumentParameters({
    document,
    commitVersionUuid: commit.uuid,
  })
  const urlData = usePaginatedDocumentLogUrl({
    selectedLog: data.selectedLog,
    page: 1, // Keyset pagination doesn't use page numbers
    isLoading: data.isLoadingLog,
  })

  const hasLogs = data.hasNext || data.hasPrevious || data.selectedLog

  return (
    <div className='flex flex-col gap-y-4'>
      <div className='flex flex-row gap-x-4 justify-between items-center border-border border-b pb-4'>
        {data.isLoadingLog || hasLogs ? (
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
              currentIndex={data.hasPrevious ? 1 : 0}
              totalCount={
                data.hasNext || data.hasPrevious ? 2 : data.selectedLog ? 1 : 0
              }
              onPrevPage={data.navigateToPrevious}
              onNextPage={data.navigateToNext}
            />
          </>
        ) : (
          <div className='w-full flex justify-center'>
            <Text.H5>No logs found</Text.H5>
          </div>
        )}
      </div>
      <div className={cn({ 'opacity-50': data.isLoadingLog })}>
        <ParametersWrapper document={document} commit={commit}>
          {({ metadataParameters }) =>
            metadataParameters.map((param, idx) => {
              const input = inputs?.[param]

              if (!input) return null

              const includedInPrompt = input.metadata.includeInPrompt ?? true

              const file = asPromptLFile(input.value)

              return (
                <div
                  className='grid col-span-2 grid-cols-subgrid gap-3 w-full items-start'
                  key={idx}
                >
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
                    {file ? (
                      <PromptLFileParameter file={file} />
                    ) : (
                      <DebouncedTextArea
                        param={param}
                        input={input}
                        setInput={setInput}
                        disabled={data.isLoadingLog}
                      />
                    )}
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
