import { DocumentVersion } from '@latitude-data/core/browser'
import { ButtonWithBadge, DotIndicator, Popover } from '@latitude-data/web-ui'
import usePublishedDocument from '$/stores/publishedDocument'

import { ShareSettings } from './ShareSettings'

export function ShareDocument({
  document,
  projectId,
}: {
  document: DocumentVersion
  projectId: number
}) {
  const { isPublished } = usePublishedDocument({
    documentUuid: document.documentUuid,
    projectId,
  })

  return (
    <Popover.Root>
      <Popover.Trigger>
        <ButtonWithBadge
          fancy
          variant='outline'
          badge={
            isPublished && <DotIndicator variant='success' size='md' pulse />
          }
        >
          Share Prompt
        </ButtonWithBadge>
      </Popover.Trigger>
      <Popover.Content maxHeight='none' width={500} align='end'>
        <ShareSettings document={document} projectId={projectId} />
      </Popover.Content>
    </Popover.Root>
  )
}
