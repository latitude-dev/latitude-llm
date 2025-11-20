import { useHistoryParameters } from '$/hooks/useDocumentParameters/useHistoryParameters'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { cn } from '@latitude-data/web-ui/utils'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import type { ICommitContextType } from '$/app/providers/CommitProvider'
import Link from 'next/link'

import {
  asPromptLFile,
  PromptLFileParameter,
} from '$/components/PromptLFileParameter'
import { ChangeEvent, useCallback, useEffect, useMemo } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { ParametersWrapper } from '../ParametersWrapper'

import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { useSpansKeysetPaginationStore } from '$/stores/spansKeysetPagination'
import { ROUTES } from '$/services/routes'
import { SimpleKeysetTablePaginationFooter } from '$/components/TablePaginationFooter/SimpleKeysetTablePaginationFooter'
import { useSpan } from '$/stores/spans'
import {
  PromptSpanMetadata,
  SpanType,
  SpanWithDetails,
} from '@latitude-data/core/constants'
import { useOnce } from '$/hooks/useMount'

function DebouncedTextArea({
  value,
  onChange,
  param,
  disabled,
}: {
  param: string
  value: string
  onChange: (param: string, value: string) => void
  disabled: boolean
}) {
  const setInputDebounced = useDebouncedCallback(
    async (value: string) => {
      onChange(param, value)
    },
    100,
    { trailing: true },
  )
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      setInputDebounced(value)
    },
    [setInputDebounced],
  )

  return (
    <TextArea
      name={param}
      defaultValue={value}
      minRows={1}
      maxRows={6}
      onChange={handleChange}
      disabled={disabled}
    />
  )
}

export function HistoryLogParams({
  commit,
  document,
  urlSpan,
  onClearUrlSpan,
}: {
  document: DocumentVersion
  commit: ICommitContextType['commit']
  urlSpan?: SpanWithDetails<SpanType.Prompt>
  onClearUrlSpan: () => void
}) {
  const {
    items = [],
    count,
    hasNext,
    hasPrev,
    isLoading: isLoadingSpans,
    goToNextPage,
    goToPrevPage,
  } = useSpansKeysetPaginationStore({
    projectId: String(commit.projectId),
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
    limit: 1,
  })

  const spanId = items[0]?.id
  const traceId = items[0]?.traceId
  const { data: fetchedSpan, isLoading: isLoadingSpan } = useSpan({
    spanId,
    traceId,
  })
  const span = urlSpan || fetchedSpan
  const isLoading = isLoadingSpans || isLoadingSpan

  // Show clear button when URL span is active
  const { inputs, setInput, metadataParameters } = useHistoryParameters({
    document,
    commitVersionUuid: commit.uuid,
  })

  useOnce(() => {
    if (urlSpan && !!urlSpan?.metadata?.parameters) {
      metadataParameters?.forEach((key) => {
        setInput(key, {
          value: (urlSpan?.metadata?.parameters[key] as string) ?? '',
          metadata: { includeInPrompt: true },
        })
      })
    }
  }, !!urlSpan && !!metadataParameters)

  useEffect(() => {
    if (!!urlSpan) return
    if (!span) return
    if (!span?.metadata) {
      metadataParameters?.forEach((key) => {
        setInput(key, {
          value: '',
          metadata: { includeInPrompt: true },
        })
      })

      return
    }

    const promptSpanMetadata = span.metadata as PromptSpanMetadata
    metadataParameters?.forEach((key) => {
      setInput(key, {
        value: (promptSpanMetadata.parameters[key] as string) ?? '',
        metadata: { includeInPrompt: true },
      })
    })
  }, [span, metadataParameters])

  const urlData = useMemo(() => {
    if (!span) return undefined

    const route = ROUTES.projects
      .detail({ id: commit.projectId })
      .commits.detail({ uuid: commit.uuid })
      .documents.detail({ uuid: document.documentUuid }).traces.root
    const query = new URLSearchParams({
      spanId: span.id,
      traceId: span.traceId,
    }).toString()

    return { url: `${route}?${query}`, shortCode: span.id.slice(0, 7) }
  }, [span, commit.projectId, commit.uuid, document.documentUuid])

  const handleInputChange = useCallback(
    (param: string, value: string) => {
      setInput(param, {
        value,
        metadata: { includeInPrompt: true },
      })
    },
    [setInput],
  )

  return (
    <div className='flex flex-col gap-y-4'>
      <div className='flex flex-row gap-x-4 justify-between items-center border-border border-b pb-4'>
        {isLoading || items.length > 0 || urlSpan ? (
          <>
            <div className='flex flex-grow min-w-0'>
              {isLoading ? (
                <div className='flex flex-row gap-x-2 w-full'>
                  <Skeleton height='h3' className='w-2/3' />
                  <Skeleton height='h3' className='w-1/3' />
                </div>
              ) : null}
              {!isLoading && span && urlData ? (
                <Link
                  href={urlData.url}
                  className='flex-grow min-w-0 flex flex-row items-center gap-x-2'
                >
                  <Text.H5 ellipsis noWrap>
                    {span.startedAt.toISOString()}
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
            <div className='flex flex-row items-center gap-x-2'>
              {!!urlSpan && (
                <Button
                  onClick={onClearUrlSpan}
                  variant='outlineDestructive'
                  size='small'
                >
                  Clear selection
                </Button>
              )}
              {!urlSpan && (
                <SimpleKeysetTablePaginationFooter
                  count={count}
                  isLoading={isLoading}
                  hasNext={hasNext}
                  hasPrev={hasPrev}
                  setNext={goToNextPage}
                  setPrev={goToPrevPage}
                />
              )}
            </div>
          </>
        ) : (
          <div className='w-full flex justify-center'>
            <Text.H5>No logs found</Text.H5>
          </div>
        )}
      </div>
      <div className={cn({ 'opacity-50': isLoading })}>
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
                        value={input.value ?? ''}
                        onChange={handleInputChange}
                        disabled={isLoading}
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
