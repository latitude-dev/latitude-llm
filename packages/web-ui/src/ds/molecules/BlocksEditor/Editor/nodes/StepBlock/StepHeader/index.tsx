import { createPortal } from 'react-dom'
import {
  ChangeEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Text } from '../../../../../../atoms/Text'
import { Input } from '../../../../../../atoms/Input'
import { ReactStateDispatch } from '../../../../../../../lib/commonTypes'
import { Icon } from '../../../../../../atoms/Icons'
import { Button } from '../../../../../../atoms/Button'
import { TooltipProvider, Tooltip } from '../../../../../../atoms/Tooltip'
import {
  triggerStepDelete,
  triggerStepIsolateUpdate,
  triggerStepNameUpdate,
} from '../../../plugins/StepEditPlugin'
import { SwitchInput } from '../../../../../../atoms/Switch'

function StepName({
  as,
  onEdit,
}: {
  as: string | undefined
  onEdit: ReactStateDispatch<boolean>
}) {
  const noName = as === undefined || as === ''
  const label = as === undefined || as === '' ? 'No step name' : as
  return (
    <div className='group min-h-6 flex flex-row items-center gap-x-1'>
      <Text.H6M color='foreground' textOpacity={as ? 100 : 50}>
        {label}
      </Text.H6M>
      <button
        onClick={() => onEdit(true)}
        className='opacity-0 group-hover:opacity-100'
      >
        <Icon
          name={noName ? 'plus' : 'pencil'}
          color='foregroundMuted'
          size='small'
        />
      </button>
    </div>
  )
}

function RightArea({
  isolated,
  stepKey,
}: {
  isolated: boolean
  stepKey: string
}) {
  const onIsolatedChange = useCallback(
    (newIsolated: boolean) => {
      triggerStepIsolateUpdate(stepKey, newIsolated)
    },
    [stepKey],
  )
  return (
    <div className='flex flex-row items-center gap-x-2'>
      <div className='flex flex-row items-center gap-x-1'>
        <SwitchInput
          fullWidth={false}
          defaultChecked={isolated}
          checked={isolated}
          onCheckedChange={onIsolatedChange}
        />
        <Tooltip triggerIcon={{ name: 'circleHelp', color: 'foregroundMuted' }}>
          {`Isolated: Prevent this step from inheriting context
        from previous steps. This can reduce unnecessary costs or confusion for
        the model. Type '{{ nameOfStep }}' to reference the step name in the prompt.`}
        </Tooltip>
      </div>
      <Button
        size='icon'
        variant='nope'
        className='opacity-50 hover:opacity-100'
        iconProps={{
          name: 'close',
          color: 'foregroundMuted',
        }}
        onClick={() => triggerStepDelete(stepKey)}
      />
    </div>
  )
}

export function StepHeader({
  stepKey,
  stepIndex,
  as,
  isolated,
}: {
  stepKey: string
  stepIndex: number
  as: string | undefined
  isolated: boolean
}) {
  const inputWrapper = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(as || '')
  const [pos, setPos] = useState<{
    top: number
    left: number
    width: number
  } | null>(null)
  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setValue(e.target.value)
    },
    [setValue],
  )

  const save = useCallback(() => {
    setEditing(false)
    // transform: spaces or "-" to "_"
    const transformed = value.trim().replace(/[\s-]+/g, '_')
    if (transformed !== as) {
      setValue(transformed)
      triggerStepNameUpdate(stepKey, transformed)
    }
  }, [stepKey, value, as])

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        save()
      }
    },
    [save],
  )

  useEffect(() => {
    if (editing && inputWrapper.current) {
      const rect = inputWrapper.current.getBoundingClientRect()
      setPos({ top: rect.top, left: rect.left, width: rect.width })
    }
  }, [editing])
  return (
    <TooltipProvider>
      <div
        contentEditable={false}
        className='relative flex flex-row items-center justify-between gap-x-2'
      >
        <div className='flex items-center gap-x-2'>
          <div className='flex items-center justify-center border border-border rounded-lg p-0.5 min-w-6 min-h-6'>
            <Text.H6M>{stepIndex}</Text.H6M>
          </div>
          <div
            ref={inputWrapper}
            className='min-h-6 flex relative items-center min-w-52'
          >
            {editing && pos ? (
              createPortal(
                <Input
                  autoFocus
                  tabIndex={0}
                  size='small'
                  name='step-name'
                  onChange={onChange}
                  onBlur={save}
                  onKeyDown={onKeyDown}
                  placeholder='Write step name here...'
                  value={value}
                  style={{
                    position: 'absolute',
                    top: pos.top,
                    left: pos.left,
                    width: pos.width,
                    zIndex: 10000,
                  }}
                />,
                document.body,
              )
            ) : (
              <StepName as={value} onEdit={setEditing} />
            )}
          </div>
        </div>
        <RightArea isolated={isolated} stepKey={stepKey} />
      </div>
    </TooltipProvider>
  )
}
