import { useCallback, FormEvent, use, useState } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Modal, CloseTrigger } from '@latitude-data/web-ui/atoms/Modal'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useIssue } from '$/stores/issues/issue'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import useEvaluationResultsV2ByDocumentLogs from '$/stores/evaluationResultsV2/byDocumentLogs'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { AnnotationContext } from '../../../FormWrapper'
import { updateEvaluationResultInstance } from '../updateEvaluationResultInstance'

export function NewIssueModal({ onClose }: { onClose: () => void }) {
  const [errors, setErrors] = useState<
    Record<'title' | 'description', string[] | undefined>
  >({
    title: undefined,
    description: undefined,
  })
  const { project } = useCurrentProject()
  const { documentLog, evaluation, result, commit } = use(AnnotationContext)
  const { mutate: mutateResults } = useEvaluationResultsV2ByDocumentLogs({
    project,
    commit,
    document: {
      commitId: commit.id,
      documentUuid: documentLog.documentUuid,
    },
    documentLogUuids: [documentLog.uuid],
  })
  const { createIssue, isCreating: isCreatingIssue } = useIssue({
    projectId: project.id,
    commitUuid: commit.uuid,
    issueId: result?.issueId,
    onIssueAssigned: ({ data: { evaluationResult } }) => {
      mutateResults((results) => {
        return updateEvaluationResultInstance({
          prev: results,
          documentLogUuid: documentLog.uuid,
          updatedResultWithEvaluation: {
            evaluation,
            result: evaluationResult,
          },
        })
      })
      onClose()
    },
  })

  const onSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      e.stopPropagation()

      if (!result) return

      const formData = new FormData(e.currentTarget)
      const title = formData.get('title')?.toString() ?? ''
      const description = formData.get('description')?.toString() ?? ''

      const [_, actionErrors] = await createIssue({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: evaluation.documentUuid,
        evaluationUuid: evaluation.uuid,
        evaluationResultUuid: result.uuid,
        title,
        description,
      })

      if (actionErrors) {
        setErrors({
          title: actionErrors.fieldErrors?.title,
          description: actionErrors.fieldErrors?.description,
        })
      } else {
        onClose()
      }
    },
    [createIssue, evaluation, project.id, commit.uuid, result, onClose],
  )
  return (
    <Modal
      open
      onOpenChange={onClose}
      title='Create new issue'
      description='Create a new issue to track this problem. We will assign it to the current evaluation.'
      dismissible
      footer={
        <>
          <CloseTrigger />
          <Button
            fancy
            disabled={isCreatingIssue}
            type='submit'
            form='new-issue-form'
          >
            {isCreatingIssue ? 'Creating...' : 'Create Issue'}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className='space-y-4' id='new-issue-form'>
        <Input name='title' label='Title' errors={errors.title} />
        <TextArea
          name='description'
          label='Description'
          errors={errors.description}
        />
      </form>
    </Modal>
  )
}
