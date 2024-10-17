import { useEffect, useRef, useState } from 'react'

import {
  Chain,
  Conversation,
  ConversationMetadata,
} from '@latitude-data/compiler'
import {
  Button,
  ErrorMessage,
  Message,
  Text,
  Tooltip,
  useAutoScroll,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

export default function Preview({
  metadata,
  parameters,
  runPrompt,
}: {
  metadata: ConversationMetadata | undefined
  parameters: Record<string, unknown>
  runPrompt: () => void
}) {
  const { commit } = useCurrentCommit()
  const document = useCurrentDocument()
  const { project } = useCurrentProject()
  const [conversation, setConversation] = useState<Conversation | undefined>(
    undefined,
  )
  const [completed, setCompleted] = useState(true)
  const [error, setError] = useState<Error | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  useAutoScroll(containerRef, { startAtBottom: true })

  useEffect(() => {
    if (!metadata) return
    if (metadata.errors.length > 0) return

    const chain = new Chain({
      prompt: metadata.resolvedPrompt,
      parameters,
    })

    chain
      .step()
      .then(({ conversation, completed }) => {
        setError(undefined)
        setConversation(conversation)
        setCompleted(completed)
      })
      .catch((error) => {
        setConversation(undefined)
        setCompleted(true)
        setError(error)
      })
  }, [metadata, parameters])

  return (
    <div className='flex flex-col flex-1 gap-2 h-full overflow-hidden'>
      <div
        ref={containerRef}
        className='flex flex-col gap-3 flex-grow flex-shrink min-h-0 custom-scrollbar'
      >
        <div className='flex flex-col gap-2'>
          <Text.H6M>Preview</Text.H6M>
          {(conversation?.messages ?? []).map((message, index) => (
            <Message
              key={index}
              role={message.role}
              content={message.content}
            />
          ))}
        </div>
        {error !== undefined && <ErrorMessage error={error} />}
        {!completed && (
          <div className='w-full py-1 px-4 bg-secondary rounded-lg'>
            <Text.H6 color='foregroundMuted'>
              Showing the first step. Other steps will show after running.
            </Text.H6>
          </div>
        )}
      </div>

      <div className='flex flex-row w-full items-center justify-center gap-2'>
        {error || (metadata?.errors.length ?? 0) > 0 ? (
          <Tooltip
            side='bottom'
            trigger={
              <Button fancy disabled>
                Run prompt
              </Button>
            }
          >
            There are errors in your prompt. Please fix them before running.
          </Tooltip>
        ) : (
          <Button fancy onClick={runPrompt}>
            Run prompt
          </Button>
        )}
        <Link
          href={
            ROUTES.projects
              .detail({ id: project.id })
              .commits.detail({ uuid: commit.uuid })
              .documents.detail({ uuid: document.documentUuid }).editor.runBatch
              .root
          }
        >
          <Button fancy variant='outline'>
            Run in batch
          </Button>
        </Link>
      </div>
    </div>
  )
}
