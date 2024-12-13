'use client'

import { useMemo, useState } from 'react'
import { TraceWithSpans } from '@latitude-data/core/browser'
import {
  Button,
  CloseTrigger,
  FakeProgress,
  FormWrapper,
  Modal,
  Select,
  Text,
  Tooltip,
} from '@latitude-data/web-ui'
import { SpanTimeline } from './SpanTimeline'
import { TraceMessages } from './TraceMessages'
import { TraceMetadata } from './TraceMetadata'
import useProjects from '$/stores/projects'
import { useCommitsFromProject } from '$/stores/commitsStore'
import useDocumentVersions from '$/stores/documentVersions'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import { MetadataInfoTabs } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/MetadataInfoTabs'

type Props = {
  trace: TraceWithSpans
}

export function TraceInfo({ trace }: Props) {
  const navigate = useNavigate()
  const [openModal, setOpenModal] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<
    string | undefined
  >(undefined)
  const [selectedCommitUuid, setSelecteCommitUuid] = useState<
    string | undefined
  >(undefined)
  const hasGenerationSpan = useMemo(() => {
    return trace.spans.some((span) => span.internalType === 'generation')
  }, [trace.spans])

  const { createFromTrace } = useDocumentVersions()
  const { data: projects } = useProjects()
  const { data: commits } = useCommitsFromProject(
    selectedProjectId ? Number(selectedProjectId) : undefined,
  )
  const handleCreateDocument = async () => {
    if (!selectedProjectId || !selectedCommitUuid) return

    const span = trace.spans.find((span) => span.internalType === 'generation')
    if (!span) return

    setIsCreating(true)

    const [documentVersion] = await createFromTrace({
      spanId: span.spanId,
      projectId: Number(selectedProjectId),
      commitUuid: selectedCommitUuid,
    })

    if (documentVersion) {
      navigate.push(
        ROUTES.projects
          .detail({ id: Number(selectedProjectId) })
          .commits.detail({ uuid: selectedCommitUuid })
          .documents.detail({ uuid: documentVersion.documentUuid }).root,
      )
    }
  }

  return (
    <>
      <div className='relative border border-border rounded-lg overflow-hidden'>
        <MetadataInfoTabs
          tabs={[
            { label: 'Metadata', value: 'metadata' },
            ...(hasGenerationSpan
              ? [{ label: 'Messages', value: 'messages' }]
              : []),
            ...(trace.spans.length > 1
              ? [{ label: 'Timeline', value: 'timeline' }]
              : []),
          ]}
          tabsActions={
            <Tooltip
              asChild
              trigger={
                <Button
                  onClick={() => setOpenModal(true)}
                  fancy
                  iconProps={{ name: 'filePlus', color: 'foregroundMuted' }}
                  variant='outline'
                  size='icon'
                  containerClassName='rounded-xl pointer-events-auto'
                  className='rounded-xl'
                />
              }
            >
              Create a prompt from this trace
            </Tooltip>
          }
        >
          {({ selectedTab }) => (
            <>
              {selectedTab === 'metadata' && <TraceMetadata trace={trace} />}
              {selectedTab === 'messages' && <TraceMessages trace={trace} />}
              {selectedTab === 'timeline' && trace.spans.length > 1 && (
                <SpanTimeline trace={trace} />
              )}
            </>
          )}
        </MetadataInfoTabs>
      </div>

      <Modal
        dismissible
        open={openModal}
        onOpenChange={(open) => {
          setOpenModal(open)

          if (!open) {
            setSelectedProjectId(undefined)
            setSelecteCommitUuid(undefined)
            setIsCreating(false)
          }
        }}
        title='Create a prompt from this trace'
        description="Our LLM agents will create a prompt from this trace's messages in the project an version you selected."
        footer={
          <>
            <CloseTrigger />
            <Button fancy type='submit' form='promptFromTraceForm'>
              Create prompt
            </Button>
          </>
        }
      >
        {!isCreating && (
          <form id='promptFromTraceForm' onSubmit={handleCreateDocument}>
            <FormWrapper>
              <Select
                required
                label='Project'
                options={projects.map((project) => ({
                  label: project.name,
                  value: String(project.id),
                }))}
                name='projectId'
                value={selectedProjectId}
                onChange={(projectId) => setSelectedProjectId(projectId)}
              />
              <Select
                required
                label='Version'
                options={commits
                  .filter((c) => !c.version && !c.deletedAt)
                  .map((commit) => ({
                    label: commit.title,
                    value: commit.uuid,
                  }))}
                name='commitUuid'
                value={selectedCommitUuid}
                onChange={(commitUuid) => setSelecteCommitUuid(commitUuid)}
              />
            </FormWrapper>
          </form>
        )}
        {isCreating && (
          <div className='flex flex-col items-center justify-center gap-4 w-full min-h-[200px] p-6 rounded-lg border bg-secondary'>
            <Text.H4M color='foreground'>Creating document...</Text.H4M>
            <Text.H5 color='foregroundMuted'>
              This may take a few seconds
            </Text.H5>
            <div className='w-1/2'>
              <FakeProgress
                completed={false}
                className='bg-muted-foreground/10'
                indicatorClassName='bg-muted-foreground'
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
