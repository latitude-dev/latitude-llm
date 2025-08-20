'use client'

import { useRef, useState, useCallback } from 'react'
import useDocumentTriggers from '$/stores/documentTriggers'
import useIntegrations from '$/stores/integrations'
import {
  DocumentTrigger,
  IntegrationDto,
  DocumentVersion,
  Project,
} from '@latitude-data/core/browser'
import { cn } from '@latitude-data/web-ui/utils'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'
import { useCurrentProject } from '@latitude-data/web-ui/providers'
import Link from 'next/link'
import { ROUTES } from '$/services/routes'
import { TriggersBlankSlate } from './TriggersBlankSlate'
import { TriggersCard } from './TriggersCard'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { usePlaygroundLogic } from '../../documents/[documentUuid]/_components/DocumentEditor/Editor/DocumentEditor'
import { ChatInputBox } from '../../documents/[documentUuid]/_components/DocumentEditor/Editor/ChatInputBox'
import Chat from '../../documents/[documentUuid]/_components/DocumentEditor/Editor/V2Playground/Chat'
import { useAutoScroll } from '@latitude-data/web-ui/hooks/useAutoScroll'

const ADD_BUTTON_LABEL = 'Add trigger'

function CreateTriggerButton({
  projectId,
  commitUuid,
  canCreate,
}: {
  projectId: number
  commitUuid: string
  canCreate: boolean
}) {
  if (!canCreate) {
    return (
      <>
        <Tooltip
          asChild
          trigger={
            <Button lookDisabled variant='outline' fancy>
              {ADD_BUTTON_LABEL}
            </Button>
          }
        >
          You need to create a new version to add new triggers
        </Tooltip>
      </>
    )
  }

  return (
    <Link
      href={
        ROUTES.projects
          .detail({ id: projectId })
          .commits.detail({ uuid: commitUuid }).preview.triggers.new.root
      }
    >
      <Button variant='outline' fancy>
        {ADD_BUTTON_LABEL}
      </Button>
    </Link>
  )
}

function TriggersHeader({ project }: { project: Project }) {
  return (
    <div className='flex flex-col gap-2 items-start justify-start'>
      <Text.H3M>{project.name}</Text.H3M>
      <Text.H5 color='foregroundMuted'>
        Choose a trigger to preview or start chatting with your agent
      </Text.H5>
    </div>
  )
}

export type OnRunTriggerFn = ({
  document,
  parameters,
}: {
  document: DocumentVersion
  parameters: Record<string, unknown>
}) => void

const FAKE_DOCUMENT = {
  id: 0,
  documentUuid: '',
  content: '',
  path: '',
} as DocumentVersion
export function TriggersList({
  triggers: fallbackData,
  integrations: fallbackIntegrations,
}: {
  triggers: DocumentTrigger[]
  integrations: IntegrationDto[]
}) {
  const [openTriggerUuid, setOpenTriggerUuid] = useState<string | null>(null)
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { data: triggers } = useDocumentTriggers(
    {
      projectId: project.id,
      commitUuid: commit.uuid,
    },
    {
      fallbackData,
      keepPreviousData: true,
    },
  )
  const { data: integrations } = useIntegrations({
    fallbackData: fallbackIntegrations,
    withTriggers: true,
  })
  const [mode, setMode] = useState<'preview' | 'chat'>('preview')
  const [expandParameters, setExpandParameters] = useState(true)
  const [activeTrigger, setActiveTrigger] = useState<{
    document: DocumentVersion
    parameters: Record<string, unknown>
  }>({
    document: FAKE_DOCUMENT,
    parameters: {},
  })

  // Always call usePlaygroundLogic to satisfy React hooks rules
  const { playground, hasActiveStream, stopStreaming, clearChat } =
    usePlaygroundLogic({
      commit,
      project,
      document: activeTrigger.document,
      parameters: activeTrigger.parameters,
      setMode,
      togglePlaygroundOpen: () => {},
      setHistoryLog: () => {},
    })

  const onRunTrigger: OnRunTriggerFn = useCallback(
    ({ document, parameters }) => {
      console.log()
      setActiveTrigger({ document, parameters })
      setMode('chat')
    },
    [setActiveTrigger, setMode],
  )

  const ref = useRef<HTMLDivElement>(null)

  useAutoScroll(ref, {
    startAtBottom: mode === 'chat',
  })

  if (triggers.length === 0) return <TriggersBlankSlate />

  return (
    <div
      ref={ref}
      className={cn(
        'relative max-h-full h-full flex flex-col items-stretch p-12 space-y-8',
        {
          'overflow-y-auto custom-scrollbar pb-0': mode === 'chat',
          'pb-4': mode === 'preview',
        },
      )}
    >
      <TriggersHeader project={project} />
      {!mode || mode === 'preview' ? (
        <>
          <div className='flex flex-col gap-6'>
            <div className='flex flex-col border rounded-lg divide-y divide-border overflow-hidden'>
              {triggers.map((trigger) => (
                <TriggersCard
                  key={trigger.uuid}
                  trigger={trigger}
                  integrations={integrations}
                  openTriggerUuid={openTriggerUuid}
                  setOpenTriggerUuid={setOpenTriggerUuid}
                  onRunTrigger={onRunTrigger}
                />
              ))}
            </div>

            <div className='flex flex-row items-center gap-x-2'>
              <CreateTriggerButton
                projectId={project.id}
                commitUuid={commit.uuid}
                canCreate={!commit.mergedAt}
              />
            </div>
          </div>
        </>
      ) : null}
      {mode === 'chat' && activeTrigger ? (
        <>
          <div className='flex-1'>
            <Chat
              showHeader
              playground={playground}
              parameters={activeTrigger.parameters}
              expandParameters={expandParameters}
              setExpandParameters={setExpandParameters}
            />
          </div>
          <div className='sticky bottom-0 w-full bg-background pb-4'>
            <ChatInputBox
              canChat
              clearChat={clearChat}
              hasActiveStream={hasActiveStream}
              playground={playground}
              stopStreaming={stopStreaming}
            />
          </div>
        </>
      ) : null}
    </div>
  )
}
