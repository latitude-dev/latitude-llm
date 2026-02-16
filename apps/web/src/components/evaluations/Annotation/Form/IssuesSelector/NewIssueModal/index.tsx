import useEvaluationResultsV2BySpans from '$/stores/evaluationResultsV2/bySpans'
import { AnnotationContext } from '../../../FormWrapper'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'
import { FakeProgress } from '@latitude-data/web-ui/molecules/FakeProgress'
import { FormEvent, use, useCallback, useState } from 'react'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { LoadingText } from '@latitude-data/web-ui/molecules/LoadingText'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { updateEvaluationResultInstance } from '../updateEvaluationResultInstance'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useIssue } from '$/stores/issues/issue'
import { useOnce } from '$/hooks/useMount'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'

export function NewIssueModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState<string | undefined>(undefined)
  const [description, setDescription] = useState<string | undefined>(undefined)
  const [errors, setErrors] = useState<
    Record<'title' | 'description', string[] | undefined>
  >({
    title: undefined,
    description: undefined,
  })
  const { project } = useCurrentProject()
  const { span, evaluation, result, commit } = use(AnnotationContext)
  const { toast } = useToast()
  const { mutate: mutateResults } = useEvaluationResultsV2BySpans({
    project,
    commit,
    document: {
      commitId: commit.id,
      documentUuid: span.documentUuid ?? '',
    },
    spanId: span.id,
    documentLogUuid: span.documentLogUuid,
  })
  const { createIssue, isCreatingIssue, isGeneratingIssue, generateIssue } =
    useIssue({
      projectId: project.id,
      commitUuid: commit.uuid,
      issueId: result?.issueId,
      onIssueGenerated: ({ data: { title, description } }) => {
        setTitle(title)
        setDescription(description)
      },
      onIssueAssigned: ({ data: { evaluationResult } }) => {
        mutateResults((results) =>
          updateEvaluationResultInstance({
            prev: results,
            updatedResultWithEvaluation: {
              evaluation,
              result: evaluationResult,
            },
          }),
        )
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

  useOnce(async () => {
    if (!result) return

    const [, error] = await generateIssue({
      projectId: project.id,
      commitUuid: commit.uuid,
      documentUuid: evaluation.documentUuid,
      evaluationUuid: evaluation.uuid,
      evaluationResultUuid: result.uuid,
    })

    if (error) {
      toast({
        description: error.message,
        variant: 'destructive',
      })
    }
  })

  if (isGeneratingIssue) {
    return (
      <Modal
        open
        onOpenChange={onClose}
        title='Generating new issue'
        description='Hold tight while we infer the issue from your annotation...'
        footer={<CloseTrigger />}
      >
        <div className='rounded-lg w-full py-40 flex flex-col gap-4 items-center justify-center bg-gradient-to-b from-secondary to-transparent px-4'>
          <div className='max-w-lg flex flex-col gap-6 items-center'>
            <div className='flex flex-col gap-2'>
              <Text.H4 align='center' display='block'>
                Generating issue...
              </Text.H4>
              <Text.H5 align='center' display='block' color='foregroundMuted'>
                This could take some time
              </Text.H5>
            </div>
            <div className='flex flex-col gap-y-4 items-center justify-center'>
              <FakeProgress completed={false} />
              <LoadingText />
            </div>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onOpenChange={onClose}
      title='Create a new issue'
      description='Create a new issue to track this problem. We will assign it to the current annotation.'
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
            {isCreatingIssue ? 'Creating...' : 'Create issue'}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className='space-y-4' id='new-issue-form'>
        <Input
          name='title'
          label='Title'
          value={title ?? ''}
          onChange={(e) => setTitle(e.target.value)}
          errors={errors.title}
        />
        <TextArea
          name='description'
          label='Description'
          value={description ?? ''}
          onChange={(e) => setDescription(e.target.value)}
          errors={errors.description}
        />
      </form>
    </Modal>
  )
}
