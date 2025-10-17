'use client'

import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useMemo } from 'react'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import Image from 'next/image'
import { AgentSelector } from './AgentSelector'
import useDocumentVersions from '$/stores/documentVersions'
import { AgentInput, AgentInputSkeleton } from '$/components/Agent/AgentInput'
import mainPromptImage from './mainPrompt.png'
import { RunProps } from '$/components/Agent/types'
import { ProjectHeader } from '../_components/ProjectHeader'
import { useDocumentDescriptions } from '$/hooks/useAgentDescriptions'

export function MainAgent({
  runPromptFn,
}: {
  runPromptFn: (props: RunProps) => void
}) {
  const { commit } = useCurrentCommit()

  const { data: documents, isLoading: isLoadingDocuments } =
    useDocumentVersions({
      commitUuid: commit.uuid,
      projectId: commit.projectId,
    })

  const mainDocument = useMemo(
    () =>
      commit.mainDocumentUuid
        ? documents?.find((d) => d.documentUuid === commit.mainDocumentUuid)
        : undefined,
    [commit.mainDocumentUuid, documents],
  )

  const selectedAgents = useMemo(() => {
    return mainDocument ? [mainDocument.path.split('/').pop() || ''] : []
  }, [mainDocument])

  const { documentDescriptions: agentDescriptions, isLoading } =
    useDocumentDescriptions({
      documentVersions: documents,
      selectedDocuments: selectedAgents,
      currentDocument: mainDocument,
    })

  return (
    <div className='flex flex-col gap-6 items-center'>
      <ProjectHeader
        description={
          <Text.H5 centered color='foregroundMuted'>
            {mainDocument
              ? isLoading
                ? 'Finding the description of your agent...'
                : agentDescriptions[mainDocument.path]
              : "Select a prompt as your project's "}
            {!mainDocument ||
              (isLoading && (
                <Tooltip
                  className='rounded-xl'
                  trigger={
                    <div className='border-border border-b-2 border-dotted cursor-text'>
                      <Text.H5 color='foregroundMuted'>main prompt</Text.H5>
                    </div>
                  }
                >
                  <div className='flex flex-col gap-2 py-1.5'>
                    <Image
                      src={mainPromptImage}
                      alt='Main prompt'
                      className='rounded-lg'
                    />
                    <Text.H5 color='white'>
                      The main prompt is the entry point to your project. You
                      can identify the main prompt through the arrow icon next
                      to it.
                    </Text.H5>
                  </div>
                </Tooltip>
              ))}
          </Text.H5>
        }
      />

      {commit.mainDocumentUuid && isLoadingDocuments ? (
        <AgentInputSkeleton />
      ) : mainDocument ? (
        <AgentInput document={mainDocument} runPromptFn={runPromptFn} />
      ) : (
        <AgentSelector documents={documents} />
      )}
    </div>
  )
}
