'use client'

import { useMemo, useState } from 'react'
import { TraceWithSpans, Workspace } from '@latitude-data/core/browser'
import {
  Button,
  FakeProgress,
  Modal,
  Text,
  Tooltip,
  useCurrentCommit,
} from '@latitude-data/web-ui'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useDocumentVersions from '$/stores/documentVersions'
import { MetadataInfoTabs } from '../../../../(commit)/documents/[documentUuid]/_components/MetadataInfoTabs'
import { SpanTimeline } from './SpanTimeline'
import { TraceMessages } from './TraceMessages'
import { TraceMetadata } from './TraceMetadata'

type Props = {
  projectId: number
  traceId: string
  workspace: Workspace
  trace: TraceWithSpans
}

export function TraceInfo({ trace }: Props) {
  const { commit } = useCurrentCommit()
  const [isCreating, setIsCreating] = useState(false)
  const hasGenerationSpan = useMemo(() => {
    return trace.spans.some((span) => span.internalType === 'generation')
  }, [trace.spans])

  const { createFromTrace } = useDocumentVersions({
    projectId: trace.projectId,
    commitUuid: commit?.uuid,
  })

  const navigate = useNavigate()
  const handleCreateFromTrace = async () => {
    setIsCreating(true)

    try {
      const [documentVersion] = await createFromTrace({
        projectId: trace.projectId,
        commitUuid: commit?.uuid,
        spanId: trace.spans[0]!.spanId,
      })

      if (documentVersion) {
        navigate.push(
          ROUTES.projects
            .detail({ id: trace.projectId })
            .commits.detail({ uuid: commit.uuid })
            .documents.detail({ uuid: documentVersion.documentUuid }).root,
        )
      }
    } finally {
      setIsCreating(false)
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
                  onClick={handleCreateFromTrace}
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
        open={isCreating}
        onOpenChange={setIsCreating}
        title='Creating Document'
        description='We are creating a new document from this trace. This may take a few seconds.'
      >
        <div className='flex flex-col items-center justify-center gap-4 w-full min-h-[200px] p-6 rounded-lg border bg-secondary'>
          <Text.H4M color='foreground'>Creating document...</Text.H4M>
          <Text.H5 color='foregroundMuted'>This may take a few seconds</Text.H5>
          <div className='w-1/2'>
            <FakeProgress
              completed={false}
              className='bg-muted-foreground/10'
              indicatorClassName='bg-muted-foreground'
            />
          </div>
        </div>
      </Modal>
    </>
  )
}
