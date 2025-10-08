import { useMemo } from 'react'
import useDocumentVersions from '$/stores/documentVersions'
import { TriggerWrapper } from '../TriggerWrapper'
import { OnRunTriggerFn } from '../TriggersList'
import { OnRunChatTrigger } from '../useActiveTrigger'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import {
  DocumentTrigger,
  DocumentVersion,
  IntegrationDto,
} from '@latitude-data/core/schema/types'
import { useTriggerInfo } from '$/components/TriggersManagement/hooks/useTriggerInfo'

function GenericTriggerCard({
  integrations,
  trigger,
  document,
  isOpen,
  onOpen,
  onRunTrigger,
  onRunChatTrigger,
}: {
  integrations: IntegrationDto[]
  trigger: DocumentTrigger
  document: DocumentVersion
  isOpen: boolean
  onOpen: () => void
  onRunTrigger: OnRunTriggerFn
  onRunChatTrigger: OnRunChatTrigger
}) {
  const { image, title, description, integration } = useTriggerInfo({
    trigger,
    document,
    integrations,
  })

  return (
    <TriggerWrapper
      title={title}
      description={description}
      image={image}
      document={document}
      trigger={trigger}
      integration={integration}
      isOpen={isOpen}
      onOpen={onOpen}
      onRunTrigger={onRunTrigger}
      onRunChatTrigger={onRunChatTrigger}
    />
  )
}

export function TriggersCard({
  trigger,
  integrations,
  openTriggerUuid,
  setOpenTriggerUuid,
  onRunTrigger,
  onRunChatTrigger,
}: {
  trigger: DocumentTrigger
  integrations: IntegrationDto[]
  openTriggerUuid: string | null
  setOpenTriggerUuid: (uuid: string) => void
  onRunTrigger: OnRunTriggerFn
  onRunChatTrigger: OnRunChatTrigger
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
    <GenericTriggerCard
      integrations={integrations}
      trigger={trigger}
      document={document}
      isOpen={openTriggerUuid === trigger.uuid}
      onOpen={() => setOpenTriggerUuid(trigger.uuid)}
      onRunTrigger={onRunTrigger}
      onRunChatTrigger={onRunChatTrigger}
    />
  )
}
