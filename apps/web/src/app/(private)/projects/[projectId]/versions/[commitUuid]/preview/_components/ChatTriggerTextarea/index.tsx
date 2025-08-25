import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DocumentTrigger, DocumentVersion } from '@latitude-data/core/browser'
import { DocumentTriggerType, ParameterType } from '@latitude-data/constants'
import useDocumentVersions from '$/stores/documentVersions'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'
import { cn } from '@latitude-data/web-ui/utils'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { ParameterInput } from '$/components/ParameterInput'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { OnRunTriggerFn } from '../TriggersList'
import { PromptLFile } from 'promptl-ai'

function getValue({ value, type }: { value: string; type: ParameterType }) {
  if (type === ParameterType.Text) return value

  try {
    const promptlFile = JSON.parse(value) as PromptLFile
    return promptlFile

    // To test locally with a tunnel use Cloudflared CLI
    // https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
    // const url = promptlFile.url
    // const publicBase = 'https://[YOUR_TUNNEL].trycloudflare.com'
    //
    // return {
    //   ...promptlFile,
    //   url: url.replace('http://localhost:3000', publicBase),
    // }
  } catch {
    // Do nothing
    return 'Not found file'
  }
}

type PromptParameters = {
  [key: string]: string | PromptLFile
}
function DocumentParameters({
  document,
  setParameters,
}: {
  document: DocumentVersion
  setParameters: ReactStateDispatch<PromptParameters>
}) {
  const { commit } = useCurrentCommit()
  const {
    manual: { inputs },
  } = useDocumentParameters({
    document,
    commitVersionUuid: commit.uuid,
  })

  const inputList = useMemo(
    () =>
      Object.keys(inputs).reduce(
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
      ),
    [inputs],
  )
  const onSetInput = useCallback(
    (name: string) => (value: string) => {
      const parsedValue = getValue({
        value,
        type:
          inputList.find((i) => i.name === name)?.type ?? ParameterType.Text,
      })

      setParameters((prev) => ({ ...prev, [name]: parsedValue }))
    },
    [setParameters, inputList],
  )

  return (
    <div className='grid grid-cols-[auto_1fr] gap-y-3'>
      {inputList.map((input, idx) => (
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

export function ChatTriggerTextarea({
  chatTrigger,
  onRunTrigger,
  chatFocused = false,
}: {
  chatTrigger: DocumentTrigger<DocumentTriggerType.Chat>
  chatFocused?: boolean
  onRunTrigger: OnRunTriggerFn
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const { commit } = useCurrentCommit()
  const { data: documents } = useDocumentVersions({
    projectId: chatTrigger.projectId,
    commitUuid: commit.uuid,
  })
  const document = useMemo<DocumentVersion | undefined>(() => {
    if (!documents) return undefined

    return documents.find((d) => d.documentUuid === chatTrigger.documentUuid)
  }, [documents, chatTrigger.documentUuid])

  const [parameters, setParameters] = useState<PromptParameters>({})
  const handleRunTrigger = useCallback(() => {
    if (!document) return

    onRunTrigger({ document, parameters, userMessage: ref.current?.value })
  }, [onRunTrigger, document, parameters])

  useEffect(() => {
    if (!chatFocused) return

    ref.current?.focus()
  }, [chatFocused])

  // Should not happen
  if (!document) return null

  return (
    <div className='bg-background flex flex-col gap-y-4'>
      <div className='flex flex-row items-center justify-between gap-x-4'>
        <div className='flex-grow'>
          <Text.H4M>Start a new conversation</Text.H4M>
        </div>
        <div className='flex-shrink-0'>
          <Select placeholder='Select a document' options={[]} />
        </div>
      </div>
      <div
        className={cn(
          'rounded-2xl border-2 border-border shadow-sm bg-background',
          'focus-within:animate-glow focus-within:glow-primary focus-within:border-primary/50',
        )}
      >
        <div className='border-b border-border p-3'>
          <DocumentParameters
            document={document}
            setParameters={setParameters}
          />
        </div>
        <div className='p-3'>
          <TextArea
            ref={ref}
            variant='unstyled'
            placeholder='Type your message here'
            minRows={1}
            className={cn(
              'bg-background w-full p-3 resize-none text-sm rounded-xl',
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
