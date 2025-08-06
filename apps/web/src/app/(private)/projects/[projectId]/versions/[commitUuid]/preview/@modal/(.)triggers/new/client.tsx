'use client'

import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { Column1, Column2, Column3 } from './_components'
import { TriggersModalProvider } from './_components/contexts/triggers-modal-context'

export function Client() {
  const navigate = useNavigate()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()

  return (
    <Modal
      open
      dismissible
      scrollable={false}
      size='xl'
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
        <div className='grid grid-cols-3 gap-4 w-full h-full overflow-y-hidden'>
          <Column1 />
          <Column2 />
          <Column3 />
        </div>
      </TriggersModalProvider>
    </Modal>
  )
}
