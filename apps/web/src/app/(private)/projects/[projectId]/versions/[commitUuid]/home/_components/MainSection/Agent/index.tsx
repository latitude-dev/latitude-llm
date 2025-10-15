'use client'

import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ProjectIcon } from './ProjectIcon'
import { useMemo } from 'react'
import { extractLeadingEmoji } from '@latitude-data/web-ui/textUtils'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import Image from 'next/image'
import { AgentSelector } from './AgentSelector'
import useDocumentVersions from '$/stores/documentVersions'
import {
  AgentInput,
  AgentInputSkeleton,
} from '$/components/Agent/AgentInput/AgentInput'
import mainPromptImage from './mainPrompt.png'
import { RunProps } from '../types'

export function MainAgent({
  runPromptFn,
}: {
  runPromptFn: (props: RunProps) => void
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()

  const { data: documents, isLoading: isLoadingDocuments } =
    useDocumentVersions({
      commitUuid: commit.uuid,
      projectId: project.id,
    })

  const mainDocument = useMemo(
    () =>
      commit.mainDocumentUuid
        ? documents?.find((d) => d.documentUuid === commit.mainDocumentUuid)
        : undefined,
    [commit.mainDocumentUuid, documents],
  )

  const title = useMemo(
    () => extractLeadingEmoji(project.name)[1],
    [project.name],
  )

  return (
    <div className='flex flex-col gap-6 items-center max-w-[500px]'>
      <ProjectIcon />

      <div className='flex flex-col items-center gap-2'>
        <Text.H3M>{title}</Text.H3M>
        <Text.H5 color='foregroundMuted'>
          {mainDocument
            ? "Start chatting with your agent's"
            : "Select a prompt as your agent's"}{' '}
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
                The main prompt is the entry point to your agent. You can
                identify the main prompt through the arrow icon next to it.
              </Text.H5>
            </div>
          </Tooltip>
        </Text.H5>
      </div>

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
