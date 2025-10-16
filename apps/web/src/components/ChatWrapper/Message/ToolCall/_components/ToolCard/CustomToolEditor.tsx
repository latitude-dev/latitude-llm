import { submitToolResultAction } from '$/actions/tools/results/submit'
import { useFormAction } from '$/hooks/useFormAction'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Label } from '@latitude-data/web-ui/atoms/Label'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { KeyboardEventHandler, useCallback, useState } from 'react'

export function CustomToolEditor({ toolCallId }: { toolCallId: string }) {
  const [value, setValue] = useState<string>('')
  const { execute, isPending } = useLatitudeAction(submitToolResultAction, {
    onSuccess: () => {}, // Note: overriding onSuccess to mute success toast
  })
  const { action } = useFormAction(execute)
  const onKeyUp = useCallback(
    (event) => {
      // cmd + enter
      if (event.ctrlKey && event.key == 'Enter' && value) {
        execute({ toolCallId, result: value, isError: false })
      }
    },
    [value, execute, toolCallId],
  ) as KeyboardEventHandler<HTMLTextAreaElement | HTMLDivElement>

  return (
    <form action={action} className='p-4 flex flex-col gap-2'>
      <Input name='toolCallId' value={toolCallId} type='hidden' />
      <Label>Your tool response</Label>
      <TextArea
        name='result'
        value={value}
        onKeyUp={onKeyUp}
        onChange={(ev) => setValue(ev.target.value)}
      />
      <div className='flex items-center justify-end'>
        <Button fancy disabled={isPending} type='submit'>
          Submit
        </Button>
      </div>
    </form>
  )
}
