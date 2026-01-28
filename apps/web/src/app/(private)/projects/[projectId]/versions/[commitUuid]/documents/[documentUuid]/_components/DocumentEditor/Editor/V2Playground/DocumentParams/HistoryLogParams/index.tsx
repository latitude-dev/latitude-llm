import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { cn } from '@latitude-data/web-ui/utils'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import type { ICommitContextType } from '$/app/providers/CommitProvider'
import Link from 'next/link'
import { useLogHistoryParams } from './useLogHistoryParams'
import {
  asPromptLFile,
  PromptLFileParameter,
} from '$/components/PromptLFileParameter'
import { useCallback, useEffect } from 'react'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { SimpleKeysetTablePaginationFooter } from '$/components/TablePaginationFooter/SimpleKeysetTablePaginationFooter'
import { ROUTES } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { INPUT_SOURCE } from '@latitude-data/core/lib/documentPersistedInputs'
import { useDocumentParameterValues } from '../DocumentParametersContext'
import { SpanType, SpanWithDetails } from '@latitude-data/constants'
import { NoInputsMessage } from '../NoInputsMessage'

export function HistoryLogParams({
  document,
  commit,
  metadataParameters,
}: {
  document: DocumentVersion
  commit: ICommitContextType['commit']
  metadataParameters: string[]
}) {
  const { getSourceValues, setParameterValue, setParameterValues } =
    useDocumentParameterValues()
  const historyValues = getSourceValues(INPUT_SOURCE.history)

  const {
    selectedSpan,
    urlSpan,
    clearUrlSelection,
    isLoading,
    hasNext,
    hasPrev,
    onNextPage,
    onPrevPage,
  } = useLogHistoryParams({
    document,
    commitVersionUuid: commit.uuid,
  })

  const span = urlSpan || selectedSpan

  const url = span
    ? `${ROUTES.projects.detail({ id: commit.projectId }).commits.detail({ uuid: commit.uuid }).documents.detail({ uuid: document.documentUuid }).traces.root}?spanId=${span.id}&traceId=${span.traceId}`
    : undefined

  const handleInputChange = useCallback(
    (param: string, value: string) => {
      setParameterValue(INPUT_SOURCE.history, param, value)
    },
    [setParameterValue],
  )

  useEffect(() => {
    if (!span) return

    const paramValues: Record<string, string> = {}

    if (span.type === SpanType.Prompt) {
      const promptSpan = span as SpanWithDetails<SpanType.Prompt>
      const parameters = promptSpan.metadata?.parameters

      metadataParameters.forEach((param) => {
        if (parameters) {
          const value = parameters[param]
          paramValues[param] =
            value !== undefined
              ? typeof value === 'string'
                ? value
                : JSON.stringify(value)
              : ''
        } else {
          paramValues[param] = ''
        }
      })
    } else {
      metadataParameters.forEach((param) => {
        paramValues[param] = ''
      })
    }

    setParameterValues(INPUT_SOURCE.history, paramValues)
  }, [span, metadataParameters, setParameterValues])

  return (
    <div className='flex flex-col gap-y-4'>
      <div className='flex flex-row gap-x-4 justify-between items-center border-border border-b pb-4'>
        {isLoading || span ? (
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
                    {span.startedAt instanceof Date
                      ? span.startedAt.toISOString()
                      : span.startedAt}
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
      <div className={cn({ 'opacity-50': isLoading })}>
        <div className='flex flex-col gap-3'>
          {metadataParameters.length > 0 ? (
            <div className='grid grid-cols-[auto_1fr] gap-y-3'>
              {metadataParameters.map((param) => {
                const value = historyValues[param] ?? ''
                const file = asPromptLFile(value)

                return (
                  <div
                    className='grid col-span-2 grid-cols-subgrid gap-3 w-full items-start'
                    key={param}
                  >
                    <div className='flex flex-row items-center gap-x-2 min-h-8'>
                      <Badge variant='accent'>
                        &#123;&#123;{param}&#125;&#125;
                      </Badge>
                    </div>
                    <div className='flex flex-grow w-full min-w-0'>
                      {file ? (
                        <PromptLFileParameter file={file} />
                      ) : (
                        <TextArea
                          name={param}
                          value={value}
                          minRows={1}
                          maxRows={6}
                          onChange={(e) =>
                            handleInputChange(param, e.target.value)
                          }
                          disabled={isLoading}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <NoInputsMessage />
          )}
        </div>
      </div>
    </div>
  )
}
