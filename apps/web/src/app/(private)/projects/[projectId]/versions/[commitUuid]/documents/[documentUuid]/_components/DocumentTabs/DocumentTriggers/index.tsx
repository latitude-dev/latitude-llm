'use client'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { DotIndicator } from '@latitude-data/web-ui/atoms/DotIndicator'
import { Popover } from '@latitude-data/web-ui/atoms/Popover'
import { Text } from '@latitude-data/web-ui/atoms/Text'

import { TriggerSettings } from './Settings'
import useDocumentTriggers from '$/stores/documentTriggers'
import { NotEditableBanner } from '../_components/NotEditableBanner'
import { useCallback, useState } from 'react'
import { TriggerConfigModal } from './Modal'
import { DocumentTriggerType } from '@latitude-data/constants'

import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { DocumentTrigger } from '@latitude-data/core/schema/models/types/DocumentTrigger'
export function DocumentTriggersButton({
  document,
  projectId,
  commitUuid,
}: {
  document: DocumentVersion
  projectId: number
  commitUuid: string
}) {
  const { data: triggers } = useDocumentTriggers({
    projectId,
    commitUuid,
    documentUuid: document.documentUuid,
  })

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [openTrigger, setOpenTrigger] = useState<
    DocumentTrigger<DocumentTriggerType.Integration> | undefined
  >()
  const openTriggerModal = useCallback(
    (trigger?: DocumentTrigger<DocumentTriggerType.Integration>) => {
      setOpenTrigger(trigger)
      setIsModalOpen(true)
    },
    [],
  )

  const onModalOpenChange = useCallback((open: boolean) => {
    setIsModalOpen(open)
    if (!open) {
      setOpenTrigger(undefined)
    }
  }, [])

  return (
    <>
      <Popover.Root>
        <Popover.Trigger asChild suppressHydrationWarning>
          <Button fancy variant='outline'>
            <div className='flex flex-row items-center gap-2'>
              <Text.H5>Triggers</Text.H5>
              <DotIndicator
                variant={triggers?.length ? 'success' : 'muted'}
                pulse={triggers?.length > 0}
              />
            </div>
          </Button>
        </Popover.Trigger>
        <Popover.Content maxHeight='none' width={500} align='end'>
          <NotEditableBanner
            description='Trigger settings can only be modified in a Draft.'
            allowOnly='drafts'
          />
          <TriggerSettings
            document={document}
            projectId={projectId}
            commitUuid={commitUuid}
            openTriggerModal={openTriggerModal}
          />
        </Popover.Content>
      </Popover.Root>
      <TriggerConfigModal
        isOpen={isModalOpen}
        onOpenChange={onModalOpenChange}
        document={document}
        projectId={projectId}
        commitUuid={commitUuid}
        trigger={openTrigger}
      />
    </>
  )
}
