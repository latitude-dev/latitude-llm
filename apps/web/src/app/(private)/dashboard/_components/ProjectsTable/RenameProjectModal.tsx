'use client'
import { useFormAction } from '$/hooks/useFormAction'
import useProjects from '$/stores/projects'
import { Project } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'

type Props = {
  project: Project
  onClose: () => void
}

export default function RenameProjectModal({ project, onClose }: Props) {
  const { toast } = useToast()
  const { update } = useProjects()
  const { action } = useFormAction(update, {
    onSuccess: (project) => {
      toast({
        title: 'Success',
        description: `Project renamed to "${project.name}".`,
      })
      onClose()
    },
  })

  return (
    <Modal
      open
      dismissible
      onOpenChange={onClose}
      title='Rename Project'
      description='Change the name of this project.'
      footer={
        <>
          <CloseTrigger />
          <Button fancy form='renameProjectForm' type='submit'>
            Rename Project
          </Button>
        </>
      }
    >
      <form id='renameProjectForm' action={action}>
        <FormWrapper>
          <Input name='id' hidden readOnly type='number' value={project.id} />
          <Input
            required
            type='text'
            label='Name'
            name='name'
            defaultValue={project.name}
            placeholder='New project name'
          />
          <input type='hidden' name='id' value={project.id} />
        </FormWrapper>
      </form>
    </Modal>
  )
}
