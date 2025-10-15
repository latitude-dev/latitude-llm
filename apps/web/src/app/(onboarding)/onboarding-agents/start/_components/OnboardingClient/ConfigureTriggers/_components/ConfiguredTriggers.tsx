import { useMemo } from 'react'
import { IntegrationDto } from '@latitude-data/core/schema/models/types/Integration'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { DocumentTrigger } from '@latitude-data/core/schema/models/types/DocumentTrigger'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import useDocumentVersions from '$/stores/documentVersions'
import {
  StatusFlag,
  StatusFlagState,
} from '@latitude-data/web-ui/molecules/StatusFlag'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useTriggerInfo } from '$/components/TriggersManagement/hooks/useTriggerInfo'

export function ConfiguredTriggers({
  trigger,
  integrations,
}: {
  trigger: DocumentTrigger
  integrations: IntegrationDto[]
}) {
  const { commit } = useCurrentCommit()
  const { data: documents } = useDocumentVersions({
    projectId: trigger.projectId,
    commitUuid: commit.uuid,
  })

  const document = useMemo<DocumentVersion | undefined>(
    () => documents?.find((d) => d.documentUuid === trigger.documentUuid),
    [documents, trigger.documentUuid],
  )

  // Loading documents. Triggers always should have a document linked
  if (!document) return null

  return (
    <ConfiguredTriggerWrapper
      trigger={trigger}
      document={document}
      integrations={integrations}
    />
  )
}

function ConfiguredTriggerWrapper({
  trigger,
  document,
  integrations,
}: {
  trigger: DocumentTrigger
  document: DocumentVersion
  integrations: IntegrationDto[]
}) {
  const { image, title, integration } = useTriggerInfo({
    trigger,
    document,
    integrations,
  })

  return (
    <div className='flex flex-col rounded-lg w-full bg-secondary items-center min-h-[60px]'>
      <div className={'w-full p-4 flex flex-row items-start gap-4'}>
        <div className='relative'>
          <div
            className={cn(
              'size-10 rounded-md bg-backgroundCode flex items-center justify-center overflow-hidden',
            )}
          >
            {image}
          </div>
          <div className='absolute -top-1 -right-1'>
            <StatusFlag
              state={StatusFlagState.completed}
              backgroundColor='successMutedForeground'
            />
          </div>
        </div>
        <div className='flex flex-col min-w-0'>
          <Text.H4M ellipsis noWrap>
            {title}
          </Text.H4M>
          {integration && (
            <Text.H5 color='foregroundMuted'>
              {integration.configuration.metadata?.displayName} trigger
              configured successfully
            </Text.H5>
          )}
        </div>
      </div>
    </div>
  )
}
