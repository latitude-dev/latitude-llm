'use client'

import { ROUTES } from '$/services/routes'
import useDocumentTriggers from '$/stores/documentTriggers'
import useIntegrations from '$/stores/integrations'
import {
  DocumentTrigger,
  DocumentVersion,
  IntegrationDto,
  Project,
} from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { useAutoScroll } from '@latitude-data/web-ui/hooks/useAutoScroll'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { cn } from '@latitude-data/web-ui/utils'
import Link from 'next/link'
import { useCallback, useRef, useState } from 'react'
import { ChatInputBox } from '../../documents/[documentUuid]/_components/DocumentEditor/Editor/ChatInputBox'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { useRunDocument } from '../../documents/[documentUuid]/_components/DocumentEditor/Editor/Playground/hooks/useRunDocument'
import Chat from '../../documents/[documentUuid]/_components/DocumentEditor/Editor/V2Playground/Chat'
import { ChatTriggerTextarea } from './ChatTriggerTextarea'
import { TriggersBlankSlate } from './TriggersBlankSlate'
import { TriggersCard } from './TriggersCard'
import { UnconfiguredIntegrations } from './UnconfiguredIntegrations'
import { useActiveChatTrigger } from './useActiveTrigger'
import { useTriggerSockets } from './useTriggerSockets'

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

function TriggersHeader({
  project,
  mode,
}: {
  project: Project
  mode: 'preview' | 'chat'
}) {
  return (
    <div className='flex flex-col gap-2 items-start justify-start'>
      <Text.H3M>{project.name}</Text.H3M>
      {mode === 'preview' && (
        <Text.H5 color='foregroundMuted'>
          Choose a trigger to preview or start chatting with your agent
        </Text.H5>
      )}
    </div>
  )
}

export type OnRunTriggerFn = ({
  document,
  parameters,
  userMessage,
  aiParameters,
}: {
  document: DocumentVersion
  parameters: Record<string, unknown>
  userMessage?: string
  aiParameters?: boolean
}) => void

const FAKE_DOCUMENT = {
  id: 0,
  documentUuid: '',
  content: '',
  path: '',
} as DocumentVersion

type ActiveTrigger = {
  document: DocumentVersion
  parameters: Record<string, unknown>
  userMessage?: string
}
export function TriggersList({
  triggers: fallbackData,
  integrations: fallbackIntegrations,
}: {
  triggers: DocumentTrigger[]
  integrations: IntegrationDto[]
}) {
  const [openTriggerUuid, setOpenTriggerUuid] = useState<string | null>(null)
  const toggleOpenTriggerUuid = useCallback(
    (uuid: string) => {
      if (openTriggerUuid === uuid) {
        setOpenTriggerUuid(null)
      } else {
        setOpenTriggerUuid(uuid)
      }
    },
    [openTriggerUuid],
  )
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { data: triggers, mutate } = useDocumentTriggers(
    {
      projectId: project.id,
      commitUuid: commit.uuid,
    },
    {
      fallbackData,
      keepPreviousData: true,
    },
  )
  useTriggerSockets({ commit, project, mutate })
  const { data: integrations } = useIntegrations({
    fallbackData: fallbackIntegrations,
  })

  const [expandParameters, setExpandParameters] = useState(true)
  const [activeTrigger, setActiveTrigger] = useState<ActiveTrigger>({
    document: FAKE_DOCUMENT,
    parameters: {},
  })
  const activeChatTrigger = useActiveChatTrigger({
    commit,
    project,
    triggers,
  })
  const { runDocument, addMessages, abortCurrentStream, hasActiveStream } =
    useRunDocument({
      commit,
    })

  const runPromptFn = useCallback(
    ({
      document,
      userMessage,
      parameters = {},
      aiParameters = false,
    }: {
      document: DocumentVersion
      parameters: Record<string, unknown>
      userMessage: string | undefined
      aiParameters: boolean
    }) =>
      runDocument({
        document,
        parameters,
        userMessage,
        aiParameters,
      }),
    [runDocument],
  )

  const playground = usePlaygroundChat({
    runPromptFn,
    addMessagesFn: addMessages,
    onPromptRan: (documentLogUuid, error) => {
      if (!documentLogUuid || error) return
    },
  })

  const onRunTrigger: OnRunTriggerFn = useCallback(
    ({ document, parameters, userMessage, aiParameters = false }) => {
      setActiveTrigger({ document, parameters, userMessage })
      playground.start({ document, parameters, userMessage, aiParameters })
    },
    [setActiveTrigger, playground],
  )

  const ref = useRef<HTMLDivElement | null>(null)

  useAutoScroll(ref, {
    startAtBottom: playground.mode === 'chat',
  })

  if (triggers.length === 0) {
    return <TriggersBlankSlate />
  }

  return (
    <div
      ref={ref}
      className={cn('relative max-h-full h-full flex flex-col p-12 space-y-8', {
        'overflow-y-auto custom-scrollbar pb-0': playground.mode === 'chat',
      })}
    >
      <TriggersHeader project={project} mode={playground.mode} />
      {playground.mode === 'preview' ? (
        <>
          <div className='flex-1'>
            <div className='flex flex-col gap-6'>
              <UnconfiguredIntegrations integrations={integrations} />

              <div className='flex flex-col border rounded-xl divide-y divide-border flex-1 overflow-hidden'>
                {triggers.map((trigger) => (
                  <TriggersCard
                    key={trigger.uuid}
                    trigger={trigger}
                    integrations={integrations}
                    openTriggerUuid={openTriggerUuid}
                    setOpenTriggerUuid={toggleOpenTriggerUuid}
                    onRunTrigger={onRunTrigger}
                    onRunChatTrigger={activeChatTrigger.onRunChatTrigger}
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
          </div>
        </>
      ) : null}
      {playground.mode === 'chat' && activeTrigger ? (
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
              resetChat={playground.reset}
              hasActiveStream={hasActiveStream}
              playground={playground}
              stopStreaming={abortCurrentStream}
              placeholder='Ask anything'
              onBack={playground.reset}
              onBackLabel='Back to triggers'
            />
          </div>
        </>
      ) : null}

      {playground.mode !== 'chat' && activeChatTrigger.active ? (
        <div className='sticky bottom-6'>
          <ChatTriggerTextarea
            key={activeChatTrigger.activeKey}
            commit={commit}
            project={project}
            document={activeChatTrigger.active.document}
            chatTrigger={activeChatTrigger.active.trigger}
            chatFocused={activeChatTrigger.chatBoxFocused}
            onRunTrigger={onRunTrigger}
            options={activeChatTrigger.options}
            onChange={activeChatTrigger.onChange}
          />
        </div>
      ) : null}
    </div>
  )
}
