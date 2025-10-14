import { ParameterInput } from '$/components/ParameterInput'
import {
  UseDocumentParameters,
  useDocumentParameters,
} from '$/hooks/useDocumentParameters'
import useDocumentTriggers from '$/stores/documentTriggers'
import useDocumentVersions from '$/stores/documentVersions'
import { DocumentTriggerType, ParameterType } from '@latitude-data/constants'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Select, SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { font } from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'
import { PromptLFile } from 'promptl-ai'
import {
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { OnRunTriggerFn } from '../TriggersList'
import {
  Commit,
  DocumentTrigger,
  DocumentVersion,
  Project,
} from '@latitude-data/core/schema/types'

/**
 * Utility to convert localhost URLs to Cloudflare tunnel URLs for testing
 * This is handy so locally uploadeds files to your machine can be seen on the
 * LLM providers side.
 *
 * To start the tunnel use the Cloudflared CLI:
 * cloudflared tunnel--url http://localhost:3000
 */
function getPromptlFile({
  file,
  clouldflareTunnel,
}: {
  file: PromptLFile
  clouldflareTunnel?: string
}) {
  if (!clouldflareTunnel) return file

  // To test locally with a tunnel use Cloudflared CLI
  const cloudflareUrl = `https://${clouldflareTunnel}.trycloudflare.com`
  const url = file.url
  return {
    ...file,
    url: url.replace('http://localhost:3000', cloudflareUrl),
  }
}

function buildParamatersFromInputs({
  inputs,
}: {
  inputs: UseDocumentParameters['manual']['inputs']
}) {
  return Object.keys(inputs).reduce(
    (acc, key) => {
      const input = inputs[key]
      if (!input) return acc

      acc.push({
        name: key,
        value: '',
        type: input.metadata.type ?? ParameterType.Text,
      })
      return acc
    },
    [] as {
      name: string
      value: string
      type: ParameterType
    }[],
  )
}

type ParametersState = ReturnType<typeof buildParamatersFromInputs>

function getValue({ value, type }: { value: string; type: ParameterType }) {
  if (type === ParameterType.Text) return value

  try {
    const promptlFile = JSON.parse(value) as PromptLFile
    return getPromptlFile({ file: promptlFile })
  } catch {
    // Do nothing
    return 'Not found file'
  }
}

type PromptParameters = {
  [key: string]: string | PromptLFile
}
function DocumentParameters({
  parameters,
  setParameters,
}: {
  parameters: ParametersState
  setParameters: ReactStateDispatch<ParametersState>
}) {
  const onSetInput = useCallback(
    (name: string) => (value: string) => {
      setParameters((prev) =>
        prev.map((p) => (p.name === name ? { ...p, value } : p)),
      )
    },
    [setParameters],
  )
  return (
    <div className='grid grid-cols-[auto_1fr] gap-y-3'>
      {parameters.map((input, idx) => (
        <div
          key={idx}
          className='grid col-span-2 grid-cols-subgrid gap-3 w-full items-start'
        >
          <div className='flex flex-row items-center gap-x-2 min-h-8'>
            <Badge variant='accent'>&#123;&#123;{input.name}&#125;&#125;</Badge>
          </div>
          <ParameterInput
            name={input.name}
            value={input.value}
            type={input.type}
            onChange={onSetInput(input.name)}
          />
        </div>
      ))}
    </div>
  )
}

function useDocumentParametersList({
  document,
}: {
  document: DocumentVersion
}) {
  const { commit } = useCurrentCommit()
  const {
    manual: { inputs },
  } = useDocumentParameters({
    document,
    commitVersionUuid: commit.uuid,
  })

  const [parameters, setParameters] = useState<ParametersState>(
    buildParamatersFromInputs({ inputs }),
  )

  useEffect(() => {
    setParameters(buildParamatersFromInputs({ inputs }))
  }, [inputs])

  return {
    parameters,
    setParameters,
  }
}

export function ChatTriggerTextarea({
  commit,
  project,
  document: activeDocument,
  chatTrigger: activeTrigger,
  onRunTrigger,
  chatFocused = false,
  options,
  onChange,
}: {
  commit: Commit
  project: Project
  document: DocumentVersion
  chatTrigger: DocumentTrigger<DocumentTriggerType.Chat>
  chatFocused?: boolean
  onRunTrigger: OnRunTriggerFn
  options: SelectOption<string>[]
  onChange: (value: string) => void
}) {
  const { data: triggers } = useDocumentTriggers({
    projectId: project.id,
    commitUuid: commit.uuid,
  })
  const { data: documents } = useDocumentVersions({
    projectId: project.id,
    commitUuid: commit.uuid,
  })

  const document = useMemo(
    () =>
      documents?.find((d) => d.documentUuid === activeTrigger.documentUuid) ??
      activeDocument,
    [documents, activeTrigger, activeDocument],
  )
  const chatTrigger = useMemo(
    () =>
      (triggers?.find(
        (trigger) => trigger.uuid === activeTrigger.uuid,
      ) as DocumentTrigger<DocumentTriggerType.Chat>) ?? activeTrigger,
    [triggers, activeTrigger],
  )
  const ref = useRef<HTMLTextAreaElement>(null)
  const { parameters, setParameters } = useDocumentParametersList({
    document,
  })
  const handleRunTrigger = useCallback(() => {
    // Convert parameters to Record<string, unknown>
    const params: PromptParameters = parameters.reduce((acc, param) => {
      acc[param.name] = getValue({ value: param.value, type: param.type })
      return acc
    }, {} as PromptParameters)
    onRunTrigger({
      document,
      parameters: params,
      userMessage: ref.current?.value,
    })
  }, [onRunTrigger, document, parameters])

  useEffect(() => {
    if (!chatFocused) return

    ref.current?.focus()
  }, [chatFocused])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleRunTrigger()
      }
    },
    [handleRunTrigger],
  )

  return (
    <div className='bg-background flex flex-col gap-y-4'>
      <div className='flex flex-row items-center justify-between gap-x-4'>
        <div className='flex-grow'>
          <Text.H4M>Start a new conversation</Text.H4M>
        </div>
        {options.length > 1 ? (
          <div className='flex-shrink-0'>
            <Select
              name='trigger_selector'
              placeholder='Select a document'
              options={options}
              value={chatTrigger.uuid}
              onChange={onChange}
            />
          </div>
        ) : null}
      </div>
      <div
        className={cn(
          'rounded-2xl border border-border shadow-sm bg-background',
          'focus-within:animate-glow focus-within:glow-primary focus-within:border-primary/50',
        )}
      >
        {parameters.length > 0 ? (
          <div className='border-b border-border p-3'>
            <DocumentParameters
              parameters={parameters}
              setParameters={setParameters}
            />
          </div>
        ) : null}
        <div className='p-3'>
          <TextArea
            ref={ref}
            variant='unstyled'
            size='none'
            placeholder='Ask anything'
            minRows={1}
            onKeyDown={handleKeyDown}
            className={cn(
              font.size.h5,
              'bg-background w-full resize-none text-sm',
              'border-none outline-none ring-0',
              'custom-scrollbar scrollable-indicator',
            )}
          />
          <div className='flex justify-end p-3'>
            <Button
              fancy
              roundy
              variant='default'
              iconProps={{ name: 'circlePlay' }}
              onClick={handleRunTrigger}
            >
              Run
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
