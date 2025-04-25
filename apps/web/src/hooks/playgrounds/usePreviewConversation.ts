import { useEffect, useMemo, useState } from 'react'
import {
  Conversation,
  Message as ConversationMessage,
  Chain as LegacyChain,
} from '@latitude-data/compiler'
import {
  Adapters,
  ConversationMetadata,
  Chain as PromptlChain,
} from 'promptl-ai'
import { AppliedRules, applyProviderRules } from '@latitude-data/core/browser'
import useProviderApiKeys from '$/stores/providerApiKeys'

export function usePreviewConversation({
  promptlVersion,
  parameters,
  metadata,
}: {
  promptlVersion: number
  metadata: ConversationMetadata | undefined
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
    if (promptlVersion === undefined) return
    if (!metadata) return
    if (!parameters) return
    if (metadata.errors.length > 0) return

    const usePromptl = promptlVersion !== 0
    let chain
    try {
      chain = usePromptl
        ? new PromptlChain({
            prompt: metadata.resolvedPrompt,
            parameters,
            adapter: Adapters.default,
            includeSourceMap: true,
          })
        : new LegacyChain({
            prompt: metadata.resolvedPrompt,
            parameters,
            includeSourceMap: true,
          })
    } catch (e) {
      setError(e as Error)
      return
    }

    chain
      .step()
      .then(({ completed, ...rest }) => {
        const conversation =
          promptlVersion === 0
            ? (rest as { conversation: Conversation }).conversation
            : (rest as unknown as Conversation)
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
  }, [provider, conversation])

  return {
    error,
    warningRule,
    completed,
    fixedMessages: fixedMessages ?? [],
  }
}
