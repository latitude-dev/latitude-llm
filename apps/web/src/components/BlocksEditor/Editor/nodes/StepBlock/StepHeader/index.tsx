import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip, TooltipProvider } from '@latitude-data/web-ui/atoms/Tooltip'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import {
  ChangeEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { triggerToggleDevEditor } from '../../../plugins/ReferencesPlugin'
import {
  triggerStepDelete,
  triggerStepIsolateUpdate,
  triggerStepNameUpdate,
} from '../../../plugins/StepEditPlugin'

function StepName({
  as,
  onEdit,
  readOnly,
}: {
  as: string | undefined
  onEdit: ReactStateDispatch<boolean>
  readOnly?: boolean
}) {
  const noName = as === undefined || as === ''
  const label = noName ? 'No step name' : as
  return (
    <div
      className='group min-h-6 flex flex-row items-center gap-x-1 select-none cursor-text'
      onDoubleClick={() => !readOnly && onEdit(true)}
    >
      <Text.H6M color='foreground' textOpacity={as ? 100 : 50}>
        {label}
      </Text.H6M>
      {!readOnly && (
        <button
          onClick={() => !readOnly && onEdit(true)}
          className='opacity-0 group-hover:opacity-100'
          disabled={readOnly}
        >
          <Icon
            name={noName ? 'plus' : 'pencil'}
            color='foregroundMuted'
            size='small'
          />
        </button>
      )}
    </div>
  )
}

function RightArea({
  isolated,
  stepKey,
  otherAttributes,
  readOnly,
}: {
  isolated: boolean | undefined
  stepKey: string
  otherAttributes: Record<string, unknown> | undefined
  readOnly?: boolean
}) {
  const onIsolatedChange = useCallback(
    (newIsolated: boolean) => {
      triggerStepIsolateUpdate(stepKey, newIsolated)
    },
    [stepKey],
  )
  return (
    <div className='flex flex-row items-center gap-x-1'>
      <Tooltip triggerIcon={{ name: 'circleHelp', color: 'foregroundMuted' }}>
        {`Isolated prevents the step from inheriting context
        from previous steps. This can reduce unnecessary costs or confusion for
        the model. Type '{{ nameOfStep }}' to reference the step name in the prompt.`}
      </Tooltip>
      {readOnly ? (
        <Text.H6 color='foregroundMuted'>
          {isolated ? 'Isolated' : 'Not isolated'}
        </Text.H6>
      ) : (
        <>
          <Text.H6 color='foregroundMuted'>Isolated</Text.H6>
          <SwitchInput
            fullWidth={false}
            defaultChecked={!!isolated}
            checked={!!isolated}
            onCheckedChange={onIsolatedChange}
            disabled={readOnly}
          />
        </>
      )}
      {otherAttributes && (
        <Tooltip
          asChild
          trigger={
            <Button
              size='icon'
              variant='nope'
              iconProps={{
                name: 'settings',
                color: 'foregroundMuted',
              }}
              onClick={() => triggerToggleDevEditor()}
            />
          }
        >
          This step has extra configuration. Please click to edit it on the code
          editor.
        </Tooltip>
      )}
      {!readOnly && (
        <Button
          size='icon'
          variant='nope'
          className='opacity-50 hover:opacity-100'
          iconProps={{
            name: 'close',
            color: 'foregroundMuted',
          }}
          onClick={() => triggerStepDelete(stepKey)}
          disabled={readOnly}
        />
      )}
    </div>
  )
}

export function StepHeader({
  stepKey,
  stepIndex,
  as,
  isolated,
  otherAttributes,
  readOnly,
}: {
  stepKey: string
  stepIndex: number
  as: string | undefined
  isolated: boolean | undefined
  otherAttributes: Record<string, unknown> | undefined
  readOnly?: boolean
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
          <div className='flex items-center justify-center border border-border rounded-xl p-0.5 min-w-6 min-h-6'>
            <Text.H6M userSelect={false}>{stepIndex}</Text.H6M>
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
                  disabled={readOnly}
                />,
                document.body,
              )
            ) : (
              <StepName as={value} onEdit={setEditing} readOnly={readOnly} />
            )}
          </div>
        </div>
        <RightArea
          isolated={isolated}
          stepKey={stepKey}
          otherAttributes={otherAttributes}
          readOnly={readOnly}
        />
      </div>
    </TooltipProvider>
  )
}
