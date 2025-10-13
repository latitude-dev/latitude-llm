import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useTriggerInfo } from '$/components/TriggersManagement/hooks/useTriggerInfo'
import useDocumentVersions from '$/stores/documentVersions'
import useIntegrations from '$/stores/integrations'
import {
  DocumentTrigger,
  DocumentVersion,
} from '@latitude-data/core/schema/types'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Separator } from '@latitude-data/web-ui/atoms/Separator'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { extractLeadingEmoji } from '@latitude-data/web-ui/textUtils'
import { ReactNode, useMemo } from 'react'

function ChatSectionHeaderWrapper({
  icon,
  onClose,
  children,
}: {
  icon: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className='sticky top-0 w-full max-w-[800px] flex flex-col'>
      <Button variant='ghost' fullWidth onClick={onClose}>
        <div className='flex flex-row w-full items-center justify-between py-2'>
          <div className='flex flex-row items-center gap-2'>
            <div className='flex w-10 h-10 rounded-lg bg-secondary justify-center items-center overflow-hidden'>
              {icon}
            </div>
            {children}
          </div>

          <div className='flex flex-row items-center gap-2'>
            <Text.H5 color='foregroundMuted'>Back to agent</Text.H5>
            <Icon name='chevronUp' color='foregroundMuted' />
          </div>
        </div>
      </Button>
      <Separator variant='dashed' />
    </div>
  )
}

function TriggerChatHeader({
  activeTrigger,
  onClose,
}: {
  activeTrigger: DocumentTrigger
  onClose: () => void
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()

  const { data: integrations } = useIntegrations()
  const { data: documents } = useDocumentVersions({
    projectId: project.id,
    commitUuid: commit.uuid,
  })

  const document = useMemo<DocumentVersion | undefined>(
    () => documents?.find((d) => d.documentUuid === activeTrigger.documentUuid),
    [documents, activeTrigger.documentUuid],
  )

  const { image, title, description } = useTriggerInfo({
    trigger: activeTrigger,
    document: document!,
    integrations,
  })

  return (
    <ChatSectionHeaderWrapper icon={image} onClose={onClose}>
      <div className='flex flex-col gap-0'>
        <Text.H5M>{title}</Text.H5M>
        <Text.H5 color='foregroundMuted'>{description}</Text.H5>
      </div>
    </ChatSectionHeaderWrapper>
  )
}

export function ChatSectionHeader({
  activeTrigger,
  onClose,
}: {
  activeTrigger?: DocumentTrigger
  onClose: () => void
}) {
  const { project } = useCurrentProject()
  const [emoji, title] = useMemo(
    () => extractLeadingEmoji(project.name),
    [project.name],
  )

  if (activeTrigger) {
    return <TriggerChatHeader activeTrigger={activeTrigger} onClose={onClose} />
  }

  return (
    <ChatSectionHeaderWrapper
      icon={<Text.H3>{emoji ?? '🤖'}</Text.H3>}
      onClose={onClose}
    >
      <Text.H4M>{title}</Text.H4M>
    </ChatSectionHeaderWrapper>
  )
}
