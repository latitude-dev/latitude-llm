import { CommitStatus } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { useCurrentProject } from '@latitude-data/web-ui/providers'
import { CloseTrigger } from '@latitude-data/web-ui/atoms/Modal'
import { useFormAction } from '$/hooks/useFormAction'
import { ROUTES } from '$/services/routes'
import { useCommits } from '$/stores/commitsStore'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'
import type { DocumentVersion } from '@latitude-data/constants'

export default function DraftCommitModal({
  open,
  setOpen,
  currentDocument,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  currentDocument?: DocumentVersion
}) {
  const defaultPromptTitle = useMemo(() => new Date().toLocaleString(), [])
  const { createDraft, isCreating } = useCommits({
    commitStatus: CommitStatus.Draft,
    onSuccessCreate: (draft) => {
      if (!draft) return // should never happen but it does

      const baseRoute = ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({ uuid: draft.uuid })

      const targetRoute = currentDocument
        ? baseRoute.documents.detail({ uuid: currentDocument.documentUuid }).root
        : baseRoute.preview.root

      router.push(targetRoute)
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
          <Button fancy form='createDraftCommitForm' type='submit' disabled={isCreating}>
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
            defaultValue={input?.title ?? defaultPromptTitle}
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
