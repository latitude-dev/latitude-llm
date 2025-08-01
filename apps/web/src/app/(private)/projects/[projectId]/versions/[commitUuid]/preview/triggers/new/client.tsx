'use client'

import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'

export function Client() {
  const navigate = useNavigate()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  return (
    <Modal
      open
      dismissible
      size='xl'
      title='Add new trigger'
      description='Add a new trigger to run this project automatically'
      onOpenChange={() =>
        navigate.push(
          ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: commit.uuid }).preview.root,
        )
      }
    >
      <div className='flex flex-col gap-4'>Ola k ase</div>
    </Modal>
  )
}
