import useProviderApiKeys from '$/stores/providerApiKeys'
import { ResolvedMetadata } from '$/workers/readMetadata'
import {
  Conversation,
  Message as ConversationMessage,
} from '@latitude-data/constants/messages'
import { applyProviderRules } from '@latitude-data/core/services/ai/providers/rules/provider'
import { AppliedRules } from '@latitude-data/core/services/ai/providers/rules/types'
import { Adapters, Chain as PromptlChain } from 'promptl-ai'
import { useEffect, useMemo, useState } from 'react'

export function usePreviewConversation({
  documentUuid,
  promptlVersion,
  parameters,
  metadata,
}: {
  documentUuid: string
  promptlVersion: number
  metadata: ResolvedMetadata | undefined
  parameters: Record<string, unknown> | undefined
}) {
  const [error, setError] = useState<Error | undefined>(undefined)
  const [completed, setCompleted] = useState(true)
  const [conversation, setConversation] = useState<Conversation>()
  const [fixedMessages, setFixedMessages] = useState<ConversationMessage[]>()
  const [warningRule, setWarningRule] = useState<AppliedRules | undefined>()
  const { data: providers } = useProviderApiKeys()
  const provider = useMemo(() => {
    if (!conversation) return undefined
    if (!providers) return undefined

    const providerName = conversation.config?.['provider']
    if (!providerName) return undefined

    return providers.find((p) => p.name === providerName)
  }, [conversation, providers])

  useEffect(() => {
    if (!metadata) return
    if (!parameters) return
    if (metadata.errors.length > 0) return

    let chain
    try {
      chain = new PromptlChain({
        prompt: metadata.resolvedPrompt,
        parameters,
        adapter: Adapters.default,
        includeSourceMap: true,
      })
    } catch (e) {
      setError(e as Error)
      return
    }

    chain
      .step()
      .then(({ completed, ...rest }) => {
        // TODO(compiler): fix types
        const conversation = rest as unknown as Conversation
        setError(undefined)
        setConversation(conversation)
        setCompleted(completed)
      })
      .catch((error) => {
        setConversation(undefined)
        setCompleted(true)
        setError(error)
      })
  }, [promptlVersion, metadata, parameters])

  useEffect(() => {
    if (!conversation) return
    if (!provider) {
      setFixedMessages(conversation.messages)
      setWarningRule(undefined)
      return
    }

    const rule = applyProviderRules({
      providerType: provider.provider,
      messages: conversation.messages,
      config: conversation.config,
    })

    setFixedMessages(rule?.messages ?? conversation.messages)
    setWarningRule(rule)

    return () => {
      setFixedMessages(undefined)
      setWarningRule(undefined)
    }
  }, [provider, conversation, documentUuid])

  return {
    error,
    warningRule,
    completed,
    fixedMessages: fixedMessages ?? [],
  }
}
