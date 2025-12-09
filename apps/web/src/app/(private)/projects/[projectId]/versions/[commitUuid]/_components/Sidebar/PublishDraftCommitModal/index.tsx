import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'
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
import useFeature from '$/stores/useFeature'
import { ChangedDocument, type CommitChanges } from '@latitude-data/constants'
import { ChangesList } from './ChangesList'
import { ChangeDiff } from './ChangeDiff'
import { CommitStatus } from '@latitude-data/core/constants'
import { MainDocumentChange } from './MainDocumentChange'
import useDocumentVersions from '$/stores/documentVersions'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { TestingSection } from './TestingSection'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { createDeploymentTestAction } from '$/actions/deploymentTests/create'

function BlankSlateSelection() {
  return (
    <div className='flex flex-grow bg-secondary w-full rounded-md items-center justify-center'>
      <Text.H6 color='foregroundMuted'>
        Select a prompt to view the diff
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
  headCommit,
}: {
  commitId: number | null
  onClose: ReactStateDispatch<number | null>
  headCommit?: Commit
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
  const [selectedDocumentChange, setSelectedDocumentChange] = useState<
    ChangedDocument | undefined
  >(undefined)
  const { isEnabled: testVersionEnabled } = useFeature('testing')
  const [testingEnabled, setTestingEnabled] = useState(false)
  const [testType, setTestType] = useState<'shadow' | 'ab' | null>('shadow')
  const [trafficPercentage, setTrafficPercentage] = useState(100)
  const { data: changes, isLoading: isLoadingChanges } = useCommitsChanges({
    commit,
  })
  const { data: documents, isLoading: isLoadingDocuments } =
    useDocumentVersions({
      projectId: project.id,
      commitUuid: commit?.uuid,
    })
  const isLoading = isLoadingChanges || isLoadingDocuments
  const anyChanges = changes.anyChanges
  const hasErrors = !isLoadingChanges && changes.hasIssues
  const { execute: createTest, isPending: isCreatingTest } = useLatitudeAction(
    createDeploymentTestAction,
    {
      onSuccess: () => {
        toast({
          title: 'Success',
          description: 'Deployment test created successfully',
        })

        if (commit) {
          router.push(
            ROUTES.projects
              .detail({ id: project.id })
              .commits.detail({ uuid: commit?.uuid }).root,
          )
        }
      },
      onError: (error) => {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        })
      },
    },
  )
  const isPublishingOrCreating = isPublishing || isCreatingTest
  const disabled =
    isLoading ||
    !changes.anyChanges ||
    changes.hasIssues ||
    !title.trim() ||
    isPublishingOrCreating ||
    (testingEnabled && (!testType || !headCommit || !commit))

  useEffect(() => {
    if (commit) {
      setTitle(commit.title || '')
      setDescription(commit.description || '')
    }
  }, [commit])

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()

      if (testingEnabled && testVersionEnabled) {
        if (!headCommit) {
          toast({
            title: 'Error',
            description: 'No published version found to use as baseline',
            variant: 'destructive',
          })
          return
        }

        if (!testType || !commit) {
          toast({
            title: 'Error',
            description: 'Please complete all required fields',
            variant: 'destructive',
          })
          return
        }

        await createTest({
          projectId: project.id,
          challengerCommitUuid: commit.uuid,
          testType,
          trafficPercentage,
        })
      } else {
        publishDraft({
          projectId: project.id,
          id: commitId!,
          title,
          description,
        })
      }
    },
    [
      testingEnabled,
      testVersionEnabled,
      headCommit,
      testType,
      commit,
      trafficPercentage,
      createTest,
      project.id,
      publishDraft,
      commitId,
      title,
      description,
      toast,
    ],
  )

  return (
    <Modal
      size='xl'
      height='screen'
      scrollable={false}
      dismissible={!isPublishingOrCreating}
      open={!!commit}
      title='Deploy'
      onOpenChange={() => onClose(null)}
      description={confirmDescription({ isLoading, changes, title })}
      footer={
        <>
          <CloseTrigger />
          <Button
            fancy
            variant={hasErrors ? 'destructive' : 'default'}
            disabled={disabled}
            type='submit'
            form='publish-commit-form'
            isLoading={isPublishingOrCreating}
            iconProps={{
              name: 'arrowUp',
              position: 'right',
            }}
          >
            {isLoading
              ? 'Validating...'
              : isPublishingOrCreating
                ? testingEnabled && testVersionEnabled
                  ? 'Deploying test...'
                  : 'Deploying...'
                : testingEnabled && testVersionEnabled
                  ? 'Deploy test'
                  : 'Deploy'}
          </Button>
        </>
      }
    >
      <div className='flex flex-row gap-4 h-full divide-x divide-border'>
        <div className='flex flex-col gap-8 min-w-[368px] h-full'>
          <form id='publish-commit-form' onSubmit={handleSubmit}>
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
          </form>
          {testVersionEnabled && (
            <TestingSection
              enabled={testingEnabled}
              testType={testType}
              trafficPercentage={trafficPercentage}
              onEnabledChange={setTestingEnabled}
              onTestTypeChange={setTestType}
              onTrafficPercentageChange={setTrafficPercentage}
            />
          )}
          <div className='flex flex-col gap-4'>
            <Text.H5M>Changes</Text.H5M>
            {commit && changes.mainDocumentUuid !== undefined && (
              <MainDocumentChange commit={commit!} />
            )}
            <ChangesList
              anyChanges={anyChanges}
              selected={selectedDocumentChange}
              onSelect={setSelectedDocumentChange}
              projectId={project.id}
              commit={commit}
              documents={documents}
              isLoading={isLoading}
              changes={changes}
              onClose={onClose}
            />
          </div>
        </div>

        <div className='pl-4 flex flex-col w-full'>
          {selectedDocumentChange ? (
            <ChangeDiff change={selectedDocumentChange} />
          ) : (
            <BlankSlateSelection />
          )}
        </div>
      </div>
    </Modal>
  )
}
