'use client'
import { DocumentTrigger, DocumentVersion } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { DotIndicator } from '@latitude-data/web-ui/atoms/DotIndicator'
import { Popover } from '@latitude-data/web-ui/atoms/Popover'
import { Text } from '@latitude-data/web-ui/atoms/Text'

import { TriggerSettings } from './Settings'
import useDocumentTriggers from '$/stores/documentTriggers'
import { NotEditableBanner } from '../_components/NotEditableBanner'
import { TriggersBlankSlate } from './BlankSlate'
import { useCallback, useState } from 'react'
import { TriggerConfigModal } from './Modal'

export function DocumentTriggersButton({
  document,
  projectId,
}: {
  document: DocumentVersion
  projectId: number
}) {
  const { data: triggers } = useDocumentTriggers({
    documentUuid: document.documentUuid,
    projectId,
  })

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [openTrigger, setOpenTrigger] = useState<DocumentTrigger | undefined>()
  const openTriggerModal = useCallback((trigger?: DocumentTrigger) => {
    setOpenTrigger(trigger)
    setIsModalOpen(true)
  }, [])

  return (
    <>
      <Popover.Root>
        <Popover.Trigger asChild>
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
          <NotEditableBanner description='Trigger settings cannot be modified in a Draft.' />
          <TriggersBlankSlate
            document={document}
            openTriggerModal={openTriggerModal}
          />
          {/* <TriggerSettings document={document} projectId={projectId} /> */}
        </Popover.Content>
      </Popover.Root>
      <TriggerConfigModal
        key={openTrigger?.id}
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        document={document}
        projectId={projectId}
        trigger={openTrigger}
      />
    </>
  )
}
