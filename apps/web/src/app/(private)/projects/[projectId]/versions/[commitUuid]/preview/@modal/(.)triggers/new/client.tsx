'use client'

import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCurrentCommit, useCurrentProject } from '@latitude-data/web-ui/providers'
import { IntegrationsList } from './_components/IntegrationsList'
import { PipedreamTrigger } from './_components/TriggerTypes/PipedreamTrigger'
import { ChatTrigger } from './_components/TriggerTypes/ChatTrigger'
import { ScheduleTrigger } from './_components/TriggerTypes/ScheduleTrigger'
import { EmailTrigger } from './_components/TriggerTypes/EmailTrigger'
import { DocumentTriggerType } from '@latitude-data/constants'
import { useCallback, useState } from 'react'
import type { DocumentTrigger } from '@latitude-data/core/browser'

export type OnTriggerCreated = (dt?: DocumentTrigger) => void

// TODO: Migrate chat (old share document to be a document trigger)
// This requires a data migration although not sure how much people are using it
export type TriggerIntegrationType = DocumentTriggerType | 'Chat'

export type SelectedIntegration = {
  slug: string
  type: TriggerIntegrationType
}

function IntegrationDetail({
  selectedIntegration,
  onTriggerCreated,
}: {
  selectedIntegration?: SelectedIntegration | null
  onTriggerCreated: OnTriggerCreated
}) {
  if (!selectedIntegration) {
    return (
      <div className='flex items-center justify-center h-full'>
        <Text.H5>Select an integration</Text.H5>
      </div>
    )
  }
  const slug = selectedIntegration.slug

  if (selectedIntegration.type === 'Chat') {
    return <ChatTrigger onTriggerCreated={onTriggerCreated} />
  }

  if (selectedIntegration.type === DocumentTriggerType.Email) {
    return <EmailTrigger onTriggerCreated={onTriggerCreated} />
  }

  if (selectedIntegration.type === DocumentTriggerType.Scheduled) {
    return <ScheduleTrigger onTriggerCreated={onTriggerCreated} />
  }

  return <PipedreamTrigger key={slug} pipedreamSlug={slug} onTriggerCreated={onTriggerCreated} />
}

export function NewTrigger() {
  const navigate = useNavigate()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const [selected, setSelected] = useState<SelectedIntegration | null>(null)
  const onCloseModal = useCallback(() => {
    navigate.push(
      ROUTES.projects.detail({ id: project.id }).commits.detail({ uuid: commit.uuid }).preview.root,
    )
  }, [navigate, project.id, commit.uuid])
  const onTriggerCreated: OnTriggerCreated = useCallback(() => {
    onCloseModal()
  }, [onCloseModal])

  return (
    <Modal
      open
      dismissible
      scrollable={false}
      size='xl'
      height='screen'
      title='Add new trigger'
      description='Add a new trigger to run this project automatically'
      onOpenChange={onCloseModal}
    >
      <div className='grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-6 w-full h-full min-h-0 pb-6'>
        <IntegrationsList onSelectIntegration={setSelected} />
        <div className='border border-border rounded-lg min-h-0 bg-secondary overflow-hidden'>
          <IntegrationDetail selectedIntegration={selected} onTriggerCreated={onTriggerCreated} />
        </div>
      </div>
    </Modal>
  )
}
