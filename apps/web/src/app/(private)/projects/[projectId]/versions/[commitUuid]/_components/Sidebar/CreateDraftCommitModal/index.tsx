import {
  Button,
  CloseTrigger,
  FormWrapper,
  Input,
  Modal,
  TextArea,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { useFormAction } from '$/hooks/useFormAction'
import { ROUTES } from '$/services/routes'
import useCommits from '$/stores/commitsStore'
import { useRouter } from 'next/navigation'

export default function DraftCommitModal({
  open,
  setOpen,
}: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { createDraft, isCreating } = useCommits({
    onSuccessCreate: (draft) => {
      router.push(
        ROUTES.projects
          .detail({ id: project.id })
          .commits.detail({ uuid: draft.uuid }).root,
      )
      setOpen(false)
    },
  })
  const { error, data: input, action } = useFormAction(createDraft)
  const { project } = useCurrentProject()
  const router = useRouter()
  const formattedErrors = error?.fieldErrors as Record<string, string[]>

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title='New project version'
      description='A new version creates a draft of the whole project, where you can test and share your prompts before publishing them to production.'
      footer={
        <>
          <CloseTrigger />
          <Button
            fancy
            form='createDraftCommitForm'
            type='submit'
            disabled={isCreating}
          >
            Create version
          </Button>
        </>
      }
    >
      <form id='createDraftCommitForm' action={action}>
        <FormWrapper>
          <input type='hidden' name='projectId' value={project.id} />
          <Input
            type='text'
            label='Title'
            name='title'
            errors={formattedErrors?.title}
            defaultValue={input?.title ?? undefined}
            placeholder='A title for the version'
          />
          <TextArea
            label='Description'
            name='description'
            errors={formattedErrors?.description}
            defaultValue={input?.description ?? undefined}
            placeholder='Put a description here (optional)'
          />
        </FormWrapper>
      </form>
    </Modal>
  )
}
