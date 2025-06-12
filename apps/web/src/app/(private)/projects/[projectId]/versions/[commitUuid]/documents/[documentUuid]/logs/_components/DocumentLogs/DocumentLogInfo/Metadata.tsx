import { RunErrorMessage } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/_components/RunErrorMessage'
import { formatCostInMillicents, formatDuration } from '$/app/_lib/formatUtils'
import useProviderApiKeys from '$/stores/providerApiKeys'
import {
  DocumentLog,
  DocumentLogWithMetadataAndError,
  ProviderApiKey,
  ProviderLogDto,
} from '@latitude-data/core/browser'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { Message as MessageComponent } from '@latitude-data/web-ui/molecules/ChatWrapper'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import { format } from 'date-fns'
import { useCallback, useMemo } from 'react'

import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { MetadataItem, MetadataItemTooltip } from '$/components/MetadataItem'
import {
  asPromptLFile,
  PromptLFileParameter,
} from '$/components/PromptLFileParameter'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import { Message } from '@latitude-data/compiler'
import { getCostPer1M } from '@latitude-data/core/services/ai/estimateCost/index'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { useCurrentCommit } from 'node_modules/@latitude-data/web-ui/src/providers/CommitProvider'
import { useCurrentProject } from 'node_modules/@latitude-data/web-ui/src/providers/ProjectProvider'
import { FinishReasonItem } from '../../../../../[documentUuid]/_components/FinishReasonItem'

function costNotCalculatedReason({
  provider,
  log,
}: {
  provider: ProviderApiKey
  log: ProviderLogDto
}) {
  const model = log.config?.model
  if (!model) return 'Model not specified, we could not calculate the cost.'

  const providerKey = provider.provider
  const costImplemented = getCostPer1M({
    provider: providerKey,
    model,
  }).costImplemented

  if (costImplemented) return undefined

  return `Cost not calculated for ${providerKey} model ${model}. We have not implemented the cost calculation for this provider yet.`
}

function useCostByModel({
  providerLogs,
  providers,
  providersLoading,
}: {
  providerLogs: ProviderLogDto[]
  providers: ProviderApiKey[] | undefined
  providersLoading: boolean
}) {
  return useMemo(() => {
    if (providersLoading) return {}
    if (providers === undefined) return {}

    return (
      providerLogs?.reduce(
        (acc, log) => {
          const provider = providers.find((p) => p.id === log.providerId)
          if (!provider) return acc
          const key = String(log.providerId)
          const prevCost = acc[key]?.cost ?? 0
          acc[key] = {
            cost: prevCost + log.costInMillicents,
            notImplementedReason: costNotCalculatedReason({ provider, log }),
          }
          return acc
        },
        {} as Record<
          string,
          { cost: number; notImplementedReason: string | undefined }
        >,
      ) ?? {}
    )
  }, [providerLogs, providers, providersLoading])
}

function ProviderLogsMetadata({
  providerLog,
  documentLog,
  providerLogs,
}: {
  providerLog: ProviderLogDto
  documentLog: DocumentLogWithMetadataAndError
  providerLogs: ProviderLogDto[]
}) {
  const { data: providers, isLoading: providersLoading } = useProviderApiKeys()
  const tokensByModel = useMemo(() => {
    return (
      providerLogs?.reduce(
        (acc, log) => {
          if (!log.model) return acc

          acc[log.model!] = (acc[log.model!] ?? 0) + (log.tokens ?? 0)
          return acc
        },
        {} as Record<string, number>,
      ) ?? {}
    )
  }, [providerLogs])

  const costByModel = useCostByModel({
    providerLogs,
    providers,
    providersLoading,
  })
  const duration = useMemo(() => {
    const timeInMs = (documentLog.duration ?? 0) - (providerLog.duration ?? 0)
    if (timeInMs <= 0) return

    return formatDuration(timeInMs)
  }, [documentLog.duration, providerLog.duration])

  return (
    <>
      <MetadataItem
        label='Timestamp'
        value={format(documentLog.createdAt, 'PPp')}
      />
      <FinishReasonItem providerLog={providerLog} />
      {Object.keys(tokensByModel).length > 0 ? (
        <MetadataItemTooltip
          label='Tokens'
          loading={providersLoading}
          trigger={
            <Text.H5 color='foregroundMuted'>
              {documentLog.tokens ?? '-'}
            </Text.H5>
          }
          tooltipContent={
            <div className='flex flex-col justify-between'>
              {Object.entries(tokensByModel).map(([model, tokens]) => (
                <div
                  key={model}
                  className='flex flex-row w-full justify-between items-center gap-4'
                >
                  {model && <Text.H6B color='background'>{model}</Text.H6B>}
                  {tokens && <Text.H6 color='background'>{tokens}</Text.H6>}
                </div>
              ))}
              {Object.values(tokensByModel).some((t) => t === 0) && (
                <div className='pt-4'>
                  <Text.H6 color='background'>
                    Note: Number of tokens is provided by your LLM Provider.
                    Some providers may return 0 tokens.
                  </Text.H6>
                </div>
              )}
            </div>
          }
        />
      ) : (
        <MetadataItem
          label='Tokens'
          value={documentLog.tokens ? String(documentLog.tokens) : '-'}
        />
      )}

      {documentLog.costInMillicents ? (
        <MetadataItemTooltip
          loading={providersLoading}
          label='Cost'
          trigger={
            <Text.H5 color='foregroundMuted'>
              {formatCostInMillicents(documentLog.costInMillicents ?? 0)}
            </Text.H5>
          }
          tooltipContent={
            <div className='flex flex-col justify-between'>
              <div className='flex flex-col justify-between gap-y-2 divide-y divider-background'>
                {Object.entries(costByModel).map(
                  ([providerId, providerCost]) => (
                    <div key={providerId} className='flex flex-col w-full'>
                      <div className='flex flex-row w-full justify-between items-center gap-4'>
                        <Text.H6B color='background'>
                          {providers?.find((p) => p.id === Number(providerId))
                            ?.name ?? 'Unknown'}
                        </Text.H6B>
                        <Text.H6 color='background'>
                          {providerCost.notImplementedReason
                            ? 'N/A'
                            : formatCostInMillicents(providerCost.cost)}
                        </Text.H6>
                      </div>
                      {providerCost.notImplementedReason ? (
                        <Text.H7 color='background'>
                          {providerCost.notImplementedReason}
                        </Text.H7>
                      ) : null}
                    </div>
                  ),
                )}
                <div className='pt-4'>
                  <Text.H6 color='background'>
                    Note: This is just an estimate based on the token usage and
                    your provider's pricing. Actual cost may vary.
                  </Text.H6>
                </div>
              </div>
            </div>
          }
        />
      ) : (
        <MetadataItem label='Cost' value='-' />
      )}
      {duration && (
        <MetadataItem
          label='Time until last message'
          value={duration}
          loading={providersLoading}
        />
      )}
    </>
  )
}

export function DocumentLogParameters({
  documentLog,
}: {
  documentLog: DocumentLog
}) {
  const parameters = useMemo(() => {
    return Object.entries(documentLog.parameters).map(([parameter, value]) => {
      if (value === undefined || value === null) {
        value = ''
      } else if (typeof value === 'object' || Array.isArray(value)) {
        try {
          value = JSON.stringify(value)
        } catch (error) {
          value = String(value)
        }
      } else {
        value = String(value)
      }

      return {
        parameter,
        value,
      }
    })
  }, [documentLog.parameters])

  return (
    <div className='flex flex-col gap-y-1'>
      <div className='flex flex-row items-center justify-between'>
        <Text.H5M color='foreground'>Parameters</Text.H5M>
        <UseDocumentLogInPlaygroundButton documentLog={documentLog} />
      </div>
      <div className='grid grid-cols-[auto_1fr] gap-y-3'>
        {parameters.map(({ parameter, value }, index) => {
          const file = asPromptLFile(value)
          return (
            <div
              key={index}
              className='grid col-span-2 grid-cols-subgrid gap-3 w-full items-start'
            >
              <div className='flex flex-row items-center gap-x-2 min-h-8'>
                <Badge variant='accent'>
                  &#123;&#123;{parameter}&#125;&#125;
                </Badge>
              </div>
              <div className='flex flex-grow w-full min-w-0'>
                {file ? (
                  <PromptLFileParameter file={file} />
                ) : (
                  <TextArea
                    value={String(value || '')}
                    minRows={1}
                    maxRows={6}
                    disabled={true}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function DocumentLogMetadata({
  documentLog,
  providerLogs = [],
  lastResponse,
}: {
  documentLog: DocumentLogWithMetadataAndError
  providerLogs?: ProviderLogDto[]
  lastResponse?: Message
}) {
  const providerLog = providerLogs[providerLogs.length - 1]
  return (
    <div className='flex flex-col gap-4'>
      <RunErrorMessage error={documentLog.error} />
      <MetadataItem label='Log uuid'>
        <ClickToCopy copyValue={documentLog.uuid}>
          <Text.H5 align='right' color='foregroundMuted'>
            {documentLog.uuid.split('-')[0]}
          </Text.H5>
        </ClickToCopy>
      </MetadataItem>
      {documentLog.customIdentifier && (
        <MetadataItem label='Custom identifier'>
          <ClickToCopy copyValue={documentLog.customIdentifier}>
            <Text.H5 align='right' color='foregroundMuted'>
              {documentLog.customIdentifier}
            </Text.H5>
          </ClickToCopy>
        </MetadataItem>
      )}
      <MetadataItem label='Version'>
        <ClickToCopy copyValue={documentLog.commit.uuid}>
          <Text.H5 align='right' color='foregroundMuted'>
            {documentLog.commit.uuid.split('-')[0]}
          </Text.H5>
        </ClickToCopy>
      </MetadataItem>
      <MetadataItem
        label='Duration'
        value={formatDuration(documentLog.duration)}
      />
      {providerLog ? (
        <ProviderLogsMetadata
          providerLog={providerLog}
          providerLogs={providerLogs}
          documentLog={documentLog}
        />
      ) : null}
      {Object.keys(documentLog.parameters).length > 0 && (
        <DocumentLogParameters documentLog={documentLog} />
      )}
      {lastResponse ? (
        <div className='flex flex-col gap-y-2'>
          <Text.H5M color='foreground'>Last Response</Text.H5M>
          <MessageComponent
            role={lastResponse.role}
            content={lastResponse.content}
          />
        </div>
      ) : null}
    </div>
  )
}

function UseDocumentLogInPlaygroundButton({
  documentLog,
}: {
  documentLog: DocumentLogWithMetadataAndError | DocumentLog
}) {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const documentUuid = documentLog.documentUuid
  const { document } = useCurrentDocument()
  const {
    setSource,
    history: { setHistoryLog },
  } = useDocumentParameters({
    document,
    commitVersionUuid: commit.uuid,
  })
  const navigate = useNavigate()
  const employLogAsDocumentParameters = useCallback(() => {
    setSource('history')
    setHistoryLog(documentLog)
    navigate.push(
      ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({
          uuid: commit.uuid,
        })
        .documents.detail({ uuid: documentUuid }).root,
    )
  }, [
    setHistoryLog,
    setSource,
    navigate,
    project.id,
    commit.uuid,
    documentUuid,
    documentLog,
  ])
  const hasError = 'error' in documentLog && !!documentLog.error.message

  if (hasError) return null

  return (
    <Tooltip
      asChild
      trigger={
        <Button
          onClick={employLogAsDocumentParameters}
          iconProps={{
            name: 'arrowRight',
            widthClass: 'w-4',
            heightClass: 'h-4',
            placement: 'right',
          }}
          variant='link'
          size='none'
          containerClassName='rounded-xl pointer-events-auto'
          className='rounded-xl'
        >
          Use
        </Button>
      }
    >
      Test this log's parameters in the playground
    </Tooltip>
  )
}
