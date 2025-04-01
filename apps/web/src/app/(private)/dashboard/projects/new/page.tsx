'use client'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { CloseTrigger } from '@latitude-data/web-ui/atoms/Modal'
import { useFormAction } from '$/hooks/useFormAction'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useProjects from '$/stores/projects'

export default function NewProject() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { create } = useProjects()
  const { data, action } = useFormAction(create, {
    onSuccess: (project) => {
      toast({
        title: 'Success',
        description: `Project "${project.name}" created.`,
      })

      navigate.push(ROUTES.projects.detail({ id: project.id }).root)
    },
  })

  return (
    <Modal
      dismissible
      open
      onOpenChange={(open) => !open && navigate.push(ROUTES.dashboard.root)}
      title='Add New Project'
      description='Add a new project to this workspace.'
      footer={
        <>
          <CloseTrigger />
          <Button fancy form='createProjectForm' type='submit'>
            Add Project
          </Button>
        </>
      }
    >
      <form id='createProjectForm' action={action}>
        <FormWrapper>
          <Input
            required
            type='text'
            label='Name'
            name='name'
            defaultValue={data?.name}
            placeholder='Winterfell'
          />
        </FormWrapper>
      </form>
    </Modal>
  )
}
