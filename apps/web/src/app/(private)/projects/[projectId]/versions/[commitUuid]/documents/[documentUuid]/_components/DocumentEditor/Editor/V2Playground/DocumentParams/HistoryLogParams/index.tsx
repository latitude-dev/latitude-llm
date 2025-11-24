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
import type { ICommitContextType } from '$/app/providers/CommitProvider'
import Link from 'next/link'
import { type UseLogHistoryParams } from './useLogHistoryParams'
import {
  asPromptLFile,
  PromptLFileParameter,
} from '$/components/PromptLFileParameter'
import { ChangeEvent, useCallback, useEffect, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { ParametersWrapper } from '../ParametersWrapper'
import { PlaygroundInput } from '@latitude-data/core/lib/documentPersistedInputs'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { SimpleKeysetTablePaginationFooter } from '$/components/TablePaginationFooter/SimpleKeysetTablePaginationFooter'
import { ROUTES } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'

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
    history: { inputs, setInput },
  } = useDocumentParameters({
    document,
    commitVersionUuid: commit.uuid,
  })
  const {
    selectedSpan,
    urlSpan,
    clearUrlSelection,
    isLoading,
    hasNext,
    hasPrev,
    onNextPage,
    onPrevPage,
  } = data
  const span = urlSpan || selectedSpan

  const url = span
    ? `${ROUTES.projects.detail({ id: commit.projectId }).commits.detail({ uuid: commit.uuid }).documents.detail({ uuid: document.documentUuid }).traces.root}?spanId=${span.id}&traceId=${span.traceId}`
    : undefined

  return (
    <div className='flex flex-col gap-y-4'>
      <div className='flex flex-row gap-x-4 justify-between items-center border-border border-b pb-4'>
        {data.isLoading || span ? (
          <>
            <div className='flex flex-grow min-w-0'>
              {isLoading ? (
                <div className='flex flex-row gap-x-2 w-full'>
                  <Skeleton height='h3' className='w-2/3' />
                  <Skeleton height='h3' className='w-1/3' />
                </div>
              ) : null}
              {!isLoading && span && url && (
                <Link
                  href={url}
                  className='flex-grow min-w-0 flex flex-row items-center gap-x-2'
                >
                  <Text.H5 ellipsis noWrap>
                    {span.startedAt.toISOString()}
                  </Text.H5>
                  <Badge variant='accent'>{span.id.slice(0, 8)}</Badge>
                  <Icon
                    name='externalLink'
                    color='foregroundMuted'
                    className='flex-none'
                  />
                </Link>
              )}
            </div>
            {urlSpan ? (
              <Button variant='link' onClick={clearUrlSelection}>
                Clear selection
              </Button>
            ) : (
              <SimpleKeysetTablePaginationFooter
                hasNext={hasNext}
                hasPrev={hasPrev}
                setNext={onNextPage}
                setPrev={onPrevPage}
                isLoading={isLoading}
              />
            )}
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
                        disabled={data.isLoading}
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
