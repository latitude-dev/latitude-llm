import { useEffect, useMemo, useRef, useState } from 'react'

import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { ROUTES } from '$/services/routes'
import useProviderApiKeys from '$/stores/providerApiKeys'
import {
  Conversation,
  Message as ConversationMessage,
  Chain as LegacyChain,
} from '@latitude-data/compiler'
import {
  AppliedRules,
  applyProviderRules,
  LATITUDE_DOCS_URL,
  ProviderRules,
} from '@latitude-data/core/browser'
import {
  Adapters,
  ConversationMetadata,
  Chain as PromptlChain,
} from 'promptl-ai'
import {
  Alert,
  Button,
  ErrorMessage,
  Message,
  Text,
  Tooltip,
  useAutoScroll,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import Link from 'next/link'

import Actions, { ActionsState } from './Actions'

function WarningLink({ providerRule }: { providerRule: ProviderRules }) {
  return (
    <Link
      target='_blank'
      href={`${LATITUDE_DOCS_URL}/guides/prompt-manager/provider-rules/${providerRule}`}
      className='flex-nowrap'
    >
      <Text.H5B underline noWrap color='warningMutedForeground'>
        Learn more
      </Text.H5B>
    </Link>
  )
}

function Warnings({ warnings }: { warnings: AppliedRules }) {
  const rules = warnings.rules
  if (!rules.length) return null

  return rules.map((rule, index) => (
    <Alert
      key={index}
      variant='warning'
      description={rule.ruleMessage}
      cta={<WarningLink providerRule={rule.rule} />}
    />
  ))
}

export default function Preview({
  metadata,
  parameters,
  runPrompt,
  expandParameters,
  setExpandParameters,
}: {
  metadata: ConversationMetadata | undefined
  parameters: Record<string, unknown>
  runPrompt: () => void
} & ActionsState) {
  const { data: providers } = useProviderApiKeys()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const { project } = useCurrentProject()
  const [conversation, setConversation] = useState<Conversation>()
  const provider = useMemo(() => {
    if (!conversation) return undefined
    if (!providers) return undefined
    const providerName = conversation.config?.['provider']
    if (!providerName) return undefined
    return providers.find((p) => p.name === providerName)
  }, [conversation, providers])
  const [fixedMessages, setFixedMessages] = useState<ConversationMessage[]>()
  const [warningRule, setWarningRule] = useState<AppliedRules | undefined>()

  const [completed, setCompleted] = useState(true)
  const [error, setError] = useState<Error | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)

  useAutoScroll(containerRef, { startAtBottom: true })

  useEffect(() => {
    if (!document) return
    if (!metadata) return
    if (metadata.errors.length > 0) return

    const usePromptl = document.promptlVersion !== 0
    const chain = usePromptl
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

    chain
      .step()
      .then(({ completed, ...rest }) => {
        const conversation =
          document.promptlVersion === 0
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
  }, [metadata, parameters])

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

  return (
    <div className='flex flex-col flex-1 gap-2 h-full overflow-hidden'>
      {warningRule ? <Warnings warnings={warningRule} /> : null}
      <div className='flex flex-row items-center justify-between w-full'>
        <Text.H6M>Preview</Text.H6M>
        <Actions
          expandParameters={expandParameters}
          setExpandParameters={setExpandParameters}
        />
      </div>
      <div
        ref={containerRef}
        className='flex flex-col gap-3 flex-grow flex-shrink min-h-0 custom-scrollbar scrollable-indicator'
      >
        <div className='flex flex-col gap-2'>
          {(fixedMessages ?? []).map((message, index) => (
            <Message
              key={index}
              role={message.role}
              content={message.content}
              parameters={Object.keys(parameters)}
              collapseParameters={!expandParameters}
            />
          ))}
        </div>
        {error !== undefined && <ErrorMessage error={error} />}
        {!completed && metadata?.isChain && (
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
            asChild
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
