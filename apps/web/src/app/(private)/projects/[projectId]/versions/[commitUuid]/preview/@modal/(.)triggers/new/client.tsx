'use client'

import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { TriggersModalProvider } from './_components/contexts/triggers-modal-context'
import { IntegrationsList } from './_components/IntegrationsList'
import { TriggersList } from './_components/TriggersList'
import { IntegrationType } from '@latitude-data/constants'
import { useState } from 'react'

export type SelectedIntegration = {
  slug: string
  type: IntegrationType
}

function IntegrationDetail({
  selectedIntegration,
}: {
  selectedIntegration?: SelectedIntegration | null
}) {
  if (!selectedIntegration) {
    return (
      <div className='flex items-center justify-center h-full'>
        <Text.H5>Select an integration</Text.H5>
      </div>
    )
  }

  if (selectedIntegration.type !== IntegrationType.Pipedream) {
    console.log('TODO: Implement Chat, Schedule and Email (latitude)')
    return null
  }

  return <TriggersList pipedreamSlug={selectedIntegration.slug} />
}

export function NewTrigger() {
  const navigate = useNavigate()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const [selected, setSelected] = useState<SelectedIntegration | null>(null)

  return (
    <Modal
      open
      dismissible
      scrollable={false}
      size='xl'
      height='maxHeightScreen'
      title='Add new trigger'
      description='Add a new trigger to run this project automatically'
      onOpenChange={() => {
        navigate.push(
          ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: commit.uuid }).preview.root,
        )
      }}
    >
      <TriggersModalProvider>
        <div className='grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-6 w-full h-full min-h-0 pb-6'>
          <IntegrationsList onSelectIntegration={setSelected} />
          <div className='border border-border rounded-lg min-h-0 bg-secondary overflow-hidden'>
            <IntegrationDetail selectedIntegration={selected} />
          </div>
        </div>
      </TriggersModalProvider>
    </Modal>
  )
}
