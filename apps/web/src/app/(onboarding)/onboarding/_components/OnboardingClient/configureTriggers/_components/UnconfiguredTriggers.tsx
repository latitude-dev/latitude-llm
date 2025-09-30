import { useCallback, useMemo, useState } from 'react'
import {
  DocumentTrigger,
  DocumentVersion,
  IntegrationDto,
} from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { useTriggerInfo } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/preview/_components/TriggersCard'
import useDocumentVersions from '$/stores/documentVersions'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { EditTriggerModal } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/preview/@modal/(.)triggers/[triggerUuid]/edit/EditTriggerModal'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'

export function UnconfiguredTriggers({
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
    <ConfigureTriggerWrapper
      trigger={trigger}
      document={document}
      integrations={integrations}
    />
  )
}

function ConfigureTriggerWrapper({
  trigger,
  document,
  integrations,
}: {
  trigger: DocumentTrigger
  document: DocumentVersion
  integrations: IntegrationDto[]
}) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const { image, title, integration } = useTriggerInfo({
    trigger,
    document,
    integrations,
  })

  const onCloseModal = useCallback(() => {
    setIsEditModalOpen(false)
  }, [])

  return (
    <div className='flex flex-col relative border rounded-lg w-full'>
      <div
        className={'w-full p-4 flex flex-row items-start justify-between gap-4'}
      >
        <div
          className={cn(
            'size-10 rounded-md bg-backgroundCode flex items-center justify-center overflow-hidden',
          )}
        >
          {image}
        </div>
        <div className='flex flex-col min-w-0'>
          <Text.H4M ellipsis noWrap>
            {title}
          </Text.H4M>
          {integration && (
            <Text.H5 color='foregroundMuted'>
              {integration.configuration.metadata?.displayName} trigger needs
              configuring
            </Text.H5>
          )}
        </div>
        <div className='flex-1 flex flex-row justify-end gap-x-4'>
          <Button
            fancy
            variant='outline'
            onClick={() => setIsEditModalOpen(true)}
            iconProps={{ name: 'wrench', placement: 'left' }}
          >
            Configure
          </Button>
        </div>
      </div>
      {isEditModalOpen && (
        <EditTriggerModal
          triggerUuid={trigger.uuid}
          onClose={onCloseModal}
          withDeleteButton={false}
        />
      )}
    </div>
  )
}
