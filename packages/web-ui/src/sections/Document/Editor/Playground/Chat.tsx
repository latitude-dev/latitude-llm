import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { faker } from '@faker-js/faker'
import {
  Chain,
  CompileError,
  ContentType,
  Conversation,
  Message as ConversationMessage,
  ConversationMetadata,
  MessageRole,
} from '@latitude-data/compiler'
import { Text } from '$ui/ds/atoms'
import { ErrorMessage, Message, MessageList } from '$ui/ds/molecules'
import { ChatTextArea } from '$ui/ds/molecules/Chat/ChatTextArea'
import { useAutoScroll } from '$ui/lib/hooks/useAutoScroll'
import { cn } from '$ui/lib/utils'

async function* mockAIResponse(
  response: string,
  delay = 25,
): AsyncGenerator<[string, number]> {
  for (let i = 0; i < response.length; i++) {
    const minDelay = Math.max(0, delay * 0.5)
    const maxDelay = Math.max(0, delay * 2)
    const delayMs = Math.floor(Math.random() * (maxDelay - minDelay) + minDelay)
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    yield [response[i]!, 1]
  }
}

export default function Chat({
  metadata,
  parameters,
}: {
  metadata: ConversationMetadata
  parameters: Record<string, unknown>
}) {
  const [initialMetadata] = useState<ConversationMetadata>(metadata)
  const [error, setError] = useState<Error | undefined>()
  const [tokens, setTokens] = useState<number>(0)
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  useAutoScroll(containerRef, {
    startAtBottom: true,
    onScrollChange: setIsScrolledToBottom,
  })

  const [chain] = useState<Chain>(
    new Chain({
      prompt: initialMetadata.resolvedPrompt,
      parameters,
    }),
  )
  const runChainOnce = useRef(false)
  const [chainLength, setChainLength] = useState<number>(Infinity) // Index where the chain ends and the chat begins

  const [conversation, setConversation] = useState<Conversation | undefined>()

  const [responseStream, setResponseStream] = useState<string | undefined>()
  const StreamMessage = useMemo(() => {
    if (responseStream === undefined) return null
    if (conversation === undefined) return null
    if (conversation.messages.length < chainLength - 1) {
      return (
        <Message
          role={MessageRole.assistant}
          content={[{ type: ContentType.text, value: responseStream }]}
          animatePulse
        />
      )
    }
    if (conversation.messages.length === chainLength - 1) {
      return (
        <Message
          role={MessageRole.assistant}
          content={[{ type: ContentType.text, value: responseStream }]}
          variant='accent'
        />
      )
    }
    return (
      <Message
        role={MessageRole.assistant}
        content={[{ type: ContentType.text, value: responseStream }]}
        variant='outline'
      />
    )
  }, [responseStream, conversation, chainLength])

  const addMessage = useCallback((message: ConversationMessage) => {
    let newConversation: Conversation
    setConversation((prevConversation) => {
      newConversation = {
        ...prevConversation,
        messages: [...(prevConversation?.messages ?? []), message],
      } as Conversation
      return newConversation
    })
    return newConversation!
  }, [])

  const generateResponse = useCallback(async (_: Conversation) => {
    const mockResponse = faker.hacker.phrase()
    let response = ''
    setResponseStream(response)

    for await (const [char, tokenCount] of mockAIResponse(mockResponse)) {
      response += char
      setResponseStream(response)
      setTokens((prev) => prev + tokenCount)
    }

    setResponseStream(undefined)
    addMessage({
      role: MessageRole.assistant,
      content: [
        {
          type: ContentType.text,
          value: response,
        },
      ],
      toolCalls: [],
    })
    return response
  }, [])

  const runChain = useCallback((lastResponse?: string) => {
    chain
      .step(lastResponse)
      .then(async ({ completed, conversation }) => {
        if (completed) setChainLength(conversation.messages.length + 1)
        setConversation(conversation)

        const response = await generateResponse(conversation)

        if (completed) return
        runChain(response)
      })
      .catch((error) => {
        setError(error)
        if (error instanceof CompileError) {
          console.error(error.toString())
        } else {
          console.log(error)
        }
      })
  }, [])

  useEffect(() => {
    if (runChainOnce.current) return
    runChainOnce.current = true // Prevent double-running when StrictMode is enabled
    runChain()
  }, [])

  const submitUserMessage = useCallback((input: string) => {
    const newConversation = addMessage({
      role: MessageRole.user,
      content: [
        {
          type: ContentType.text,
          value: input,
        },
      ],
    })

    generateResponse(newConversation)
  }, [])

  return (
    <div className='flex flex-col h-full'>
      <div
        ref={containerRef}
        className='flex flex-col gap-3 h-full overflow-y-auto pb-12'
      >
        <Text.H6M>Prompt</Text.H6M>
        <MessageList
          messages={conversation?.messages.slice(0, chainLength - 1) ?? []}
        />
        {(conversation?.messages.length ?? 0) >= chainLength && (
          <MessageList
            messages={
              conversation?.messages.slice(chainLength - 1, chainLength) ?? []
            }
            variant='accent'
          />
        )}
        {(conversation?.messages.length ?? 0) > chainLength && (
          <>
            <Text.H6M>Chat</Text.H6M>
            <MessageList
              messages={conversation!.messages.slice(chainLength)}
              variant='outline'
            />
          </>
        )}
        {StreamMessage}
        {error !== undefined && <ErrorMessage error={error} />}
      </div>
      <div className='flex relative flex-row w-full items-center justify-center'>
        <div
          className={cn(
            'absolute -top-10 bg-background rounded-xl p-2 flex flex-row gap-2',
            {
              'shadow-xl': !isScrolledToBottom,
            },
          )}
        >
          <Text.H6M color='foregroundMuted'>{tokens} tokens</Text.H6M>
        </div>
        <ChatTextArea
          placeholder='Enter followup message...'
          disabled={error !== undefined || responseStream !== undefined}
          onSubmit={submitUserMessage}
        />
      </div>
    </div>
  )
}
