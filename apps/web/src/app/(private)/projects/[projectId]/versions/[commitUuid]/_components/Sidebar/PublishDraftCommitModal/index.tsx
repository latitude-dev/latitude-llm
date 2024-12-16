import { useEffect, useMemo, useState } from 'react'

import { CommitStatus } from '@latitude-data/core/browser'
import { ChangedDocument } from '@latitude-data/core/repositories'
import {
  ConfirmModal,
  FormWrapper,
  Input,
  ReactStateDispatch,
  TextArea,
  useCurrentProject,
  useToast,
} from '@latitude-data/web-ui'
import { getChangedDocumentsInDraftAction } from '$/actions/commits/getChangedDocumentsInDraftAction'
import { ROUTES } from '$/services/routes'
import { useCommits } from '$/stores/commitsStore'
import { useRouter } from 'next/navigation'
import { useServerAction } from 'zsa-react'
import { ChangesList, GroupedChanges } from './ChangesList'
import { ChangeDiff } from './ChangeDiff'

function confirmDescription({
  isLoading,
  anyChanges,
  hasErrors,
  title,
}: {
  anyChanges: boolean
  hasErrors: boolean
  isLoading: boolean
  title: string
}) {
  if (isLoading) return undefined
  if (!anyChanges) return 'No changes to publish.'
  if (!title.trim()) return 'Please provide a version name.'
  if (hasErrors)
    return 'Some documents has errors, please click on those documents to see the errors.'
  return 'Publishing a new version will update all your prompts in production.'
}

export default function PublishDraftCommitModal({
  commitId,
  onClose,
}: {
  commitId: number | null
  onClose: ReactStateDispatch<number | null>
}) {
  const { toast } = useToast()
  const { data, publishDraft, isPublishing } = useCommits({
    commitStatus: CommitStatus.Draft,
    onSuccessPublish: () => {
      router.push(ROUTES.projects.detail({ id: project.id }).commits.latest)

      toast({
        title: 'Success',
        description: 'Project published successfully.',
      })

      onClose(null)
    },
  })
  const commit = useMemo(() => data.find((c) => c.id === commitId), [commitId])
  const { project } = useCurrentProject()
  const router = useRouter()
  const {
    data: changes = [],
    execute: getChanges,
    isPending: isLoading,
  } = useServerAction(getChangedDocumentsInDraftAction)
  const [groups, setGroups] = useState<GroupedChanges>({
    errors: [],
    clean: [],
  })
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const [selectedChange, setSelectedChange] = useState<ChangedDocument>()

  useEffect(() => {
    if (commit) {
      setTitle(commit.title || '')
      setDescription(commit.description || '')
    }
  }, [commit])

  useEffect(() => {
    async function load() {
      if (!commitId) return

      const [data, error] = await getChanges({
        projectId: project.id,
        id: commitId,
      })

      if (error) {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        })
        return
      }
      if (!data) return // should not happen but it does

      setGroups(
        data.reduce(
          (acc, c) => {
            acc[c.errors > 0 ? 'errors' : 'clean'].push(c)
            return acc
          },
          {
            errors: [] as ChangedDocument[],
            clean: [] as ChangedDocument[],
          } as GroupedChanges,
        ),
      )
    }

    load()
  }, [commitId, project.id])
  const anyChanges = changes.length > 0
  const hasErrors = !anyChanges || groups.errors.length > 0

  return (
    <ConfirmModal
      size='large'
      dismissible={!isPublishing}
      type={!isLoading && hasErrors ? 'destructive' : 'default'}
      open={!!commit}
      title='Publish new version'
      description='Publishing the version will lock the contents of all prompts. Review the changes carefully before publishing.'
      onOpenChange={() => onClose(null)}
      onConfirm={() =>
        publishDraft({
          projectId: project.id,
          id: commitId!,
          title,
          description,
        })
      }
      confirm={{
        label: isLoading ? 'Validating...' : 'Publish to production',
        description: confirmDescription({
          isLoading,
          anyChanges,
          hasErrors,
          title,
        }),
        disabled: isLoading || hasErrors || !title.trim(),
        isConfirming: isPublishing,
      }}
    >
      <div className='flex flex-row gap-2 h-full'>
        <div className='flex flex-col gap-4 min-w-60 h-full'>
          <FormWrapper>
            <Input
              required
              label='Version name'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='Enter version name'
            />
            <TextArea
              label='Description'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='Enter version description'
              rows={4}
              className='resize-none'
            />
          </FormWrapper>
          <ChangesList
            anyChanges={anyChanges}
            selected={selectedChange}
            onSelect={setSelectedChange}
            commit={commit}
            projectId={project.id}
            isLoading={isLoading}
            groups={groups}
            hasErrors={!isLoading && hasErrors}
            onClose={onClose}
          />
        </div>

        <div className='flex flex-grow flex-shrink-0 w-[1px] max-w-[1px] bg-border' />

        <ChangeDiff change={selectedChange} />
      </div>
    </ConfirmModal>
  )
}
