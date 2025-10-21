import {
  ToolRequestContent,
  ToolContent,
} from '@latitude-data/constants/legacyCompiler'
import {
  ToolCardIcon,
  ToolCardText,
  ToolCardWrapper,
} from './_components/ToolCard'
import {
  KeyboardEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ToolCardHeader } from './_components/ToolCard/Header'
import { ToolCardContentWrapper } from './_components/ToolCard/Content'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { submitToolResultAction } from '$/actions/tools/results/submit'
import { useFormAction } from '$/hooks/useFormAction'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Label } from '@latitude-data/web-ui/atoms/Label'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'

function UnansweredClientToolContent({ toolCallId }: { toolCallId: string }) {
  const [value, setValue] = useState<string>('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { execute, isPending } = useLatitudeAction(submitToolResultAction, {
    onSuccess: () => {}, // Note: overriding onSuccess to mute success toast
  })
  const { action } = useFormAction(execute)
  const onKeyDown = useCallback(
    (event) => {
      if (!value) return
      if ((event.ctrlKey || event.metaKey) && event.key == 'Enter') {
        event.preventDefault()
        execute({
          toolCallId,
          result: value,
          isError: false,
        })
      }
    },
    [value, execute, toolCallId],
  ) as KeyboardEventHandler<HTMLTextAreaElement | HTMLDivElement>

  useEffect(() => {
    // focus the textarea when the component mounts
    textareaRef.current?.focus()
  }, [])

  return (
    <ToolCardContentWrapper badge='Output'>
      <form action={action} className='p-4 flex flex-col gap-2'>
        <Input name='toolCallId' value={toolCallId} type='hidden' />
        <Label>Your tool response</Label>
        <TextArea
          ref={textareaRef}
          name='result'
          value={value}
          onKeyDown={onKeyDown}
          onChange={(ev) => setValue(ev.target.value)}
        />
        <div className='flex items-center justify-end'>
          <Button fancy disabled={isPending} type='submit'>
            Submit
          </Button>
        </div>
      </form>
    </ToolCardContentWrapper>
  )
}

function AnsweredClientToolContent({
  toolResponse,
}: {
  toolResponse: ToolContent
}) {
  return (
    <ToolCardContentWrapper badge='Output'>
      {toolResponse.isError ? (
        <div className='w-full pt-3 items-center'>
          <Alert
            variant='destructive'
            title='Error'
            description={JSON.stringify(toolResponse.result, null, 2)}
          />
        </div>
      ) : (
        <CodeBlock language='json'>{toolResponse.result as string}</CodeBlock>
      )}
    </ToolCardContentWrapper>
  )
}

export function ClientToolCard({
  toolRequest,
  toolResponse,
  status,
}: {
  toolRequest: ToolRequestContent
  toolResponse: ToolContent | undefined
  status: 'pending' | 'success' | 'error'
}) {
  const [_isOpen, setIsOpen] = useState(false)
  const isOpen = useMemo(
    () => status === 'pending' || _isOpen,
    [_isOpen, status],
  )

  return (
    <ToolCardWrapper>
      <ToolCardHeader
        icon={<ToolCardIcon status={status} name='wrench' />}
        label={<ToolCardText>{toolRequest.toolName}</ToolCardText>}
        status={status}
        isOpen={isOpen}
        onToggle={status === 'pending' ? undefined : () => setIsOpen(!isOpen)}
      />

      {isOpen && (
        <ToolCardContentWrapper badge='Input'>
          <CodeBlock language='json'>
            {JSON.stringify(toolRequest.args, null, 2)}
          </CodeBlock>
        </ToolCardContentWrapper>
      )}
      {isOpen &&
        (status === 'pending' ? (
          <UnansweredClientToolContent toolCallId={toolRequest.toolCallId} />
        ) : (
          <AnsweredClientToolContent toolResponse={toolResponse!} />
        ))}
    </ToolCardWrapper>
  )
}
