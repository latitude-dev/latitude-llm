'use client'

import { useCallback } from 'react'
import { useNavigate } from '$/hooks/useNavigate'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { ROUTES } from '$/services/routes'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { NewTrigger } from '$/components/TriggersManagement/NewTrigger'
import { type OnTriggerCreated } from '$/components/TriggersManagement/types'

export function NewTriggerModal() {
  const navigate = useNavigate()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const onCloseModal = useCallback(() => {
    navigate.push(
      ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({ uuid: commit.uuid }).preview.root,
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
      <NewTrigger onTriggerCreated={onTriggerCreated} />
    </Modal>
  )
}
