'use client'

import { Button, CloseTrigger, Modal, useToast } from '@latitude-data/web-ui'
import { useFormAction } from '$/hooks/useFormAction'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useProjects from '$/stores/projects'

export default function DestroyProject({
  params: { projectId },
}: {
  params: { projectId: string }
}) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data, destroy } = useProjects()
  const project = data.find((p) => p.id === Number(projectId))
  const { action } = useFormAction(destroy, {
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    },
    onSuccess: (project) => {
      toast({
        title: 'Success',
        description: `Project "${project.name}" destroyed.`,
      })

      navigate.push(ROUTES.dashboard.root)
    },
  })

  return (
    <Modal
      open
      onOpenChange={(open) => !open && navigate.push(ROUTES.dashboard.root)}
      title='Destroy Project'
      description='Are you sure you want to destroy this project? You will be able to recover it later on.'
      footer={
        <>
          <CloseTrigger />
          <Button
            fancy
            variant='destructive'
            form='destroyProjectForm'
            type='submit'
          >
            {`Destroy ${project?.name}`}
          </Button>
        </>
      }
    >
      <form id='destroyProjectForm' action={action}>
        <input type='hidden' name='projectId' value={projectId} />
      </form>
    </Modal>
  )
}
