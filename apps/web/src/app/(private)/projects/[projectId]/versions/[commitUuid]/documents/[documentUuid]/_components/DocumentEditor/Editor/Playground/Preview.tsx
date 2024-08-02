import { useEffect, useRef, useState } from 'react'

import {
  Chain,
  CompileError,
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
} from '@latitude-data/web-ui'

export default function Preview({
  metadata,
  parameters,
  runPrompt,
}: {
  metadata: ConversationMetadata | undefined
  parameters: Record<string, unknown>
  runPrompt: () => void
}) {
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
        if (error instanceof CompileError) {
          console.error(error.toString())
        } else {
          console.log(error)
        }
      })
  }, [metadata, parameters])

  return (
    <div
      ref={containerRef}
      className='flex flex-col gap-3 h-full overflow-y-auto'
    >
      <Text.H6M>Preview</Text.H6M>
      {(conversation?.messages ?? []).map((message, index) => (
        <Message key={index} role={message.role} content={message.content} />
      ))}
      {error !== undefined && <ErrorMessage error={error} />}
      {!completed && (
        <div className='w-full py-1 px-4 bg-secondary rounded-lg'>
          <Text.H6 color='foregroundMuted'>
            Showing the first step. Other steps will show after running.
          </Text.H6>
        </div>
      )}

      <div className='flex flex-row w-full items-center justify-center'>
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
      </div>
    </div>
  )
}
