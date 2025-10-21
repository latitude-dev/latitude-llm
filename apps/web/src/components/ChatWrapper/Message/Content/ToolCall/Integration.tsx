import {
  ToolRequestContent,
  ToolContent,
} from '@latitude-data/constants/legacyCompiler'
import { useMemo } from 'react'
import {
  ToolSource,
  ToolSourceData,
} from '@latitude-data/constants/toolSources'
import { ToolCard, ToolCardIcon, ToolCardText } from './_components/ToolCard'
import Image from 'next/image'
import useIntegrations from '$/stores/integrations'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'

export function IntegrationToolCard({
  toolRequest,
  toolResponse,
  status,
  sourceData,
}: {
  toolRequest: ToolRequestContent
  toolResponse: ToolContent | undefined
  status: 'pending' | 'success' | 'error'
  sourceData: ToolSourceData<ToolSource.Integration>
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
        sourceData.imageUrl ? (
          <Image
            src={sourceData.imageUrl}
            alt={toolRequest.toolName}
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
    />
  )
}
