import {
  Button,
  CloseTrigger,
  FormWrapper,
  Input,
  Modal,
  TextArea,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { createDraftCommitAction } from '$/actions/commits/create'
import { ROUTES } from '$/services/routes'
import useCommits from '$/stores/commitsStore'
import { useRouter } from 'next/navigation'
import { useServerAction } from 'zsa-react'

export default function NewDraftCommitModal({
  open,
  setOpen,
}: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { data, mutate } = useCommits()
  const { project } = useCurrentProject()
  const router = useRouter()
  // NOTE: `input` in this hook does not work atm because this PR is not merged yet:
  // https://github.com/IdoPesok/zsa/pull/155
  // But I tried and it works nicely.
  const input = { title: '', description: '' } // Fake until the PR is merged
  const { error, executeFormAction, isPending } = useServerAction(
    createDraftCommitAction,
    {
      persistErrorWhilePending: true,
      persistDataWhilePending: true,
      onSuccess: (result) => {
        const draft = result.data
        mutate([...data, draft])
        router.push(
          ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: draft.uuid }).root,
        )
        setOpen(false)
      },
    },
  )
  const formattedErrors = error?.fieldErrors
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
            form='createDraftCommitForm'
            type='submit'
            disabled={isPending}
          >
            Create version
          </Button>
        </>
      }
    >
      <form id='createDraftCommitForm' action={executeFormAction}>
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
