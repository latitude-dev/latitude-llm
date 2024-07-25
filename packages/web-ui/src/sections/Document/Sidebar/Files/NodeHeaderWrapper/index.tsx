import {
  forwardRef,
  KeyboardEventHandler,
  ReactNode,
  RefObject,
  useEffect,
  useState,
  type ChangeEventHandler,
} from 'react'

import { DropdownMenu, MenuOption } from '$ui/ds/atoms/DropdownMenu'
import { Input } from '$ui/ds/atoms/Input'
import Text from '$ui/ds/atoms/Text'
import { cn } from '$ui/lib/utils'

import { Node } from '../useTree'

export const ICON_CLASS = 'min-w-6 h-6 text-muted-foreground'
export type IndentType = { isLast: boolean }
function IndentationBar({
  indentation,
  hasChildren,
}: {
  hasChildren: boolean
  indentation: IndentType[]
}) {
  return indentation.map((indent, index) => {
    const anyNextIndentIsNotLast = !!indentation
      .slice(index)
      .find((i) => !i.isLast)
    const showBorder = anyNextIndentIsNotLast ? false : indent.isLast
    return (
      <div key={index} className='h-6 min-w-6'>
        {index > 0 ? (
          <div className='-ml-[3px] relative w-6 h-full flex justify-center'>
            {hasChildren || !showBorder ? (
              <div className='bg-border w-px h-8 -mt-1' />
            ) : (
              <div className='relative -mt-1'>
                <div className='border-l h-2.5' />
                <div className='absolute top-2.5 border-l border-b h-2 w-2 rounded-bl-sm' />
              </div>
            )}
          </div>
        ) : null}
      </div>
    )
  })
}

type Props = {
  open: boolean
  node: Node
  selected?: boolean
  isEditing?: boolean
  onClick?: () => void
  actions: MenuOption[]
  icons: ReactNode
  indentation: IndentType[]
  inputRef: RefObject<HTMLInputElement>
  error?: string
  onChangeInput: ChangeEventHandler<HTMLInputElement>
  onKeyDownInput: KeyboardEventHandler<HTMLInputElement>
}
const NodeHeaderWrapper = forwardRef<HTMLDivElement, Props>(function Foo(
  {
    node,
    inputRef,
    open,
    selected = false,
    isEditing = false,
    error,
    onChangeInput,
    onKeyDownInput,
    onClick,
    icons,
    indentation,
    actions,
  },
  ref,
) {
  const [actionsOpen, setActionsOpen] = useState(false)

  // Litle trick to focus the input after the component is mounted
  // We wait some time to focus the input to avoid the focus being stolen
  // by the click event in the menu item that created this node.
  useEffect(() => {
    const timeout = setTimeout(() => {
      inputRef.current?.focus(), 100
    })

    return () => {
      clearTimeout(timeout)
    }
  }, [inputRef])

  return (
    <div
      tabIndex={0}
      ref={ref}
      className={cn(
        'max-w-full group/row flex flex-row my-0.5 cursor-pointer',
        {
          'hover:bg-muted': !selected,
          'bg-accent': selected,
        },
      )}
    >
      <div
        onClick={onClick}
        className='min-w-0 flex-grow flex flex-row items-center justify-between gap-x-1 py-0.5'
      >
        <IndentationBar
          indentation={indentation}
          hasChildren={open && node.children.length > 0}
        />
        <div className='flex flex-row items-center gap-x-1'>{icons}</div>
        {isEditing ? (
          <div className='pr-1 flex items-center'>
            <Input
              tabIndex={0}
              ref={inputRef}
              autoFocus
              onKeyDown={onKeyDownInput}
              onChange={onChangeInput}
              errors={error ? [error] : undefined}
              name='name'
              type='text'
              size='small'
              errorStyle='tooltip'
            />
          </div>
        ) : (
          <div className='flex-grow flex-shrink truncate'>
            <Text.H5M
              ellipsis
              noWrap
              userSelect={false}
              color={selected ? 'accentForeground' : 'foreground'}
            >
              {node.name}
            </Text.H5M>
          </div>
        )}
      </div>
      {!isEditing ? (
        <div
          className={cn(
            'flex items-center opacity-0 group-hover/row:opacity-100',
            { 'opacity-100': actionsOpen },
          )}
        >
          <DropdownMenu
            tabIndex={0}
            controlledOpen={actionsOpen}
            onOpenChange={setActionsOpen}
            options={actions}
            side='bottom'
            align='end'
          />
        </div>
      ) : null}
    </div>
  )
})

export default NodeHeaderWrapper
