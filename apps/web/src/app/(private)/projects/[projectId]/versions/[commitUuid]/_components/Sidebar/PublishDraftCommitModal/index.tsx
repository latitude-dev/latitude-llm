import { useEffect, useMemo, useState } from 'react'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { ROUTES } from '$/services/routes'
import { useCommits } from '$/stores/commitsStore'
import { useRouter } from 'next/navigation'
import { useCommitsChanges } from '$/stores/commitChanges'
import { ChangedDocument, type CommitChanges } from '@latitude-data/constants'
import { ChangesList } from './ChangesList'
import { ChangeDiff } from './ChangeDiff'
import { TriggerChangesList } from './TriggerChangesList'
import { CommitStatus } from '@latitude-data/core/constants'
import { MainDocumentChange } from './MainDocumentChange'

function BlankSlateSelection() {
  return (
    <div className='flex flex-grow bg-secondary w-full rounded-md items-center justify-center'>
      <Text.H6 color='foregroundMuted'>
        Select a change to view the diff
      </Text.H6>
    </div>
  )
}

function confirmDescription({
  isLoading,
  changes,
  title,
}: {
  changes: CommitChanges
  isLoading: boolean
  title: string
}) {
  if (isLoading) return undefined
  if (!changes.anyChanges) return 'No changes to publish.'
  if (!title.trim()) return 'Please provide a version name.'

  if (changes.documents.hasErrors) {
    return 'Some documents have errors, please click on those documents to see the errors.'
  }

  if (changes.triggers.hasPending) {
    return `There are triggers that needs to be configured before publishing.`
  }

  return 'Publishing a new version is reversible and doesnt remove previous versions! You can always go back to use previous version if needed.'
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
  const commit = useMemo(
    () => data.find((c) => c.id === commitId),
    [commitId, data],
  )
  const { project } = useCurrentProject()
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedChange, setSelectedChange] = useState<ChangedDocument>()
  const { data: changes, isLoading } = useCommitsChanges({ commit })
  useEffect(() => {
    if (commit) {
      setTitle(commit.title || '')
      setDescription(commit.description || '')
    }
  }, [commit])

  const anyChanges = changes.anyChanges
  const somethingSelected = !!selectedChange
  const hasErrors = (!isLoading && changes.hasIssues) || !anyChanges

  return (
    <ConfirmModal
      size='xl'
      height='screen'
      scrollable={false}
      dismissible={!isPublishing}
      type={hasErrors ? 'destructive' : 'default'}
      open={!!commit}
      title='Publish new version'
      description='Publish a new version of the project to create a checkpoint of the current state of the project, including all prompts and triggers.'
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
        label: isLoading ? 'Validating...' : 'Publish new version',
        description: confirmDescription({ isLoading, changes, title }),
        disabled:
          isLoading ||
          !changes.anyChanges ||
          changes.hasIssues ||
          !title.trim(),
        isConfirming: isPublishing,
      }}
    >
      <div className='flex flex-row gap-4 h-full divide-x divide-border'>
        <div className='flex flex-col gap-4 min-w-64 max-w-64 h-full'>
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
              minRows={2}
              className='resize-none'
            />
          </FormWrapper>
          {commit && changes.mainDocumentUuid !== undefined && (
            <MainDocumentChange commit={commit!} />
          )}
          <ChangesList
            anyChanges={anyChanges}
            selected={selectedChange}
            onSelect={setSelectedChange}
            commit={commit}
            projectId={project.id}
            isLoading={isLoading}
            changes={changes}
            onClose={onClose}
          />
          <TriggerChangesList isLoading={isLoading} changes={changes} />
        </div>

        <div className='pl-4 flex flex-col w-full'>
          {!somethingSelected ? <BlankSlateSelection /> : null}
          {selectedChange ? <ChangeDiff change={selectedChange} /> : null}
        </div>
      </div>
    </ConfirmModal>
  )
}
