import {
  ToolRequestContent,
  ToolContent,
} from '@latitude-data/constants/messages'
import { useMemo } from 'react'
import {
  ToolSource,
  ToolSourceData,
} from '@latitude-data/constants/toolSources'
import {
  ToolCard,
  ToolCardIcon,
  ToolCardText,
  ToolCallStatus,
} from './_components/ToolCard'
import useIntegrations from '$/stores/integrations'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { IntegrationIcon } from '$/components/Integrations/IntegrationIcon'
import Image from 'next/image'

export function IntegrationToolCard({
  toolRequest,
  toolResponse,
  status,
  sourceData,
  messageIndex,
  contentBlockIndex,
}: {
  toolRequest: ToolRequestContent
  toolResponse: ToolContent | undefined
  status: ToolCallStatus
  sourceData: ToolSourceData<ToolSource.Integration>
  messageIndex?: number
  contentBlockIndex?: number
}) {
  const { data: integrations, isLoading } = useIntegrations()
  const integration = useMemo(
    () =>
      integrations?.find(
        (integration) => integration.id === sourceData.integrationId,
      ),
    [integrations, sourceData.integrationId],
  )

  return (
    <ToolCard
      toolRequest={toolRequest}
      toolResponse={toolResponse}
      headerIcon={
        integration ? (
          <IntegrationIcon integration={integration} size={16} />
        ) : sourceData.imageUrl ? (
          <Image
            src={sourceData.imageUrl}
            alt={sourceData.toolLabel ?? toolRequest.toolName}
            width={16}
            height={16}
            unoptimized
          />
        ) : (
          <ToolCardIcon status={status} name='wrench' />
        )
      }
      headerLabel={
        <div className='flex flex-row justify-between'>
          <ToolCardText>
            {sourceData.toolLabel ?? toolRequest.toolName}
          </ToolCardText>

          {isLoading ? (
            <Skeleton height='h4' className='w-10' />
          ) : (
            <Badge variant={integration ? 'accent' : 'muted'}>
              {integration?.name ?? 'Removed integration'}
            </Badge>
          )}
        </div>
      }
      messageIndex={messageIndex}
      contentBlockIndex={contentBlockIndex}
      status={status}
    />
  )
}
