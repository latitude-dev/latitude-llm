'use client'
import {
  Fragment,
  ReactNode,
  Ref,
  RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import { cn } from '../../../lib/utils'
import { Button } from '../../atoms/Button'
import { Text } from '../../atoms/Text'

export type TabSelectorOption<T> = {
  label: ReactNode | string
  value: T
  route?: string
  disabled?: boolean
}
export type TabOptionGroup<T extends string = string> = TabSelectorOption<T>[]

export type TabSelectorOptionOrGroup<T extends string = string> =
  | TabSelectorOption<T>
  | TabOptionGroup<T>

type LinkWrapper = (props: {
  children: ReactNode
  href: string
  className?: string
}) => ReactNode

type CommonItemProps<T extends string> = {
  showSelectedOnSubroutes: boolean
  selectedOptionButtonRef: RefObject<HTMLElement | null>
  selected?: T | null
  handleSelect: (option: TabSelectorOption<T>) => () => void
  fullWidth?: boolean
  disabled?: boolean
  linkWrapper: LinkWrapper | undefined
}

function LabelText({
  isSelected,
  children,
}: {
  isSelected: boolean | undefined | null
  children: ReactNode | string
}) {
  if (typeof children === 'string') {
    return (
      <Text.H5M color={isSelected ? 'foreground' : 'foregroundMuted'}>
        {children}
      </Text.H5M>
    )
  }
  return <>{children}</>
}

function checkSelected<T extends string>(
  option: TabSelectorOption<T>,
  selected: T | null | undefined,
  showSelectedOnSubroutes: boolean,
) {
  return showSelectedOnSubroutes
    ? selected && option.value.startsWith(selected)
    : selected === option.value
}

function ItemOption<T extends string>({
  option,
  showSelectedOnSubroutes,
  selected,
  selectedOptionButtonRef,
  handleSelect,
  fullWidth,
  disabled,
  linkWrapper,
}: CommonItemProps<T> & {
  option: TabSelectorOption<T>
}) {
  const isSelected = checkSelected(option, selected, showSelectedOnSubroutes)
  const Wrapper = option.route && linkWrapper ? linkWrapper : 'div'
  return (
    <Wrapper
      className={cn('flex', fullWidth && 'flex-1')}
      href={option.route as string} // option.route is always defined if linkWrapper is defined. Otherwise it will just be undefined, which is fine
    >
      <Button
        ref={
          isSelected
            ? (selectedOptionButtonRef as unknown as Ref<HTMLButtonElement>)
            : null
        }
        type='button'
        variant='ghost'
        size='none'
        color={isSelected ? 'foreground' : 'foregroundMuted'}
        className={cn(
          'flex w-full px-3 h-8 bg-transparent rounded-lg cursor-pointer items-center justify-center gap-1',
        )}
        onClick={handleSelect(option)}
        fullWidth={fullWidth}
        disabled={disabled}
      >
        <LabelText isSelected={isSelected}>{option.label}</LabelText>
      </Button>
    </Wrapper>
  )
}

function ItemOptionGroup<T extends string>({
  group,
  selected,
  handleSelect,
  selectedOptionButtonRef,
  showSelectedOnSubroutes,
  fullWidth,
  linkWrapper,
  disabled,
}: CommonItemProps<T> & {
  group: TabOptionGroup<T>
}) {
  const isAnyItemSelected = group.some((option) => option.value === selected)
  if (!isAnyItemSelected) {
    return (
      <ItemOption
        option={group[0]}
        selected={selected}
        handleSelect={handleSelect}
        selectedOptionButtonRef={selectedOptionButtonRef}
        showSelectedOnSubroutes={showSelectedOnSubroutes}
        fullWidth={fullWidth}
        disabled={disabled}
        linkWrapper={linkWrapper}
      />
    )
  }

  return (
    <div
      ref={
        isAnyItemSelected
          ? (selectedOptionButtonRef as Ref<HTMLDivElement>)
          : null
      }
      className={cn(
        'relative font-sans font-medium transition-colors focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background group-disabled:opacity-50',
        'group-disabled:pointer-events-none text-sm leading-5 shadow-none text-muted-foreground py-0 flex w-full',
        'px-3 h-8 bg-transparent rounded-lg cursor-pointer items-center justify-center gap-1',
        'gap-3',
        {
          'flex-1': fullWidth,
        },
      )}
    >
      {group.map((option, idx) => {
        const isSelected = checkSelected(
          option,
          selected,
          showSelectedOnSubroutes,
        )
        const isLast = idx === group.length - 1
        return (
          <Fragment key={idx}>
            <button
              type='button'
              key={idx}
              onClick={handleSelect(option)}
              className='w-full'
              disabled={disabled || option.disabled}
            >
              <LabelText isSelected={isSelected}>{option.label}</LabelText>
            </button>
            {!isLast ? <div className='w-px h-4 bg-border' /> : null}
          </Fragment>
        )
      })}
    </div>
  )
}

export type TabSelectorProps<T extends string> = {
  options: TabSelectorOptionOrGroup<T>[]
  selected?: T | null
  onSelect?: (value: T) => void
  showSelectedOnSubroutes?: boolean
  fullWidth?: boolean
  disabled?: boolean
  linkWrapper: LinkWrapper | undefined
}
export function TabSelector<T extends string>({
  options,
  selected: originalSelected,
  showSelectedOnSubroutes = false,
  fullWidth = false,
  disabled,
  onSelect,
  linkWrapper,
}: TabSelectorProps<T>) {
  const selectedOptionButtonRef = useRef<HTMLElement>(null)
  const selectedOptionBackgroundRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState(originalSelected)

  useEffect(() => {
    setSelected(originalSelected)
  }, [originalSelected])

  const handleSelect = useCallback(
    (option: TabSelectorOption<T>) => () => {
      if (option.disabled) return

      setSelected(option.value)
      onSelect?.(option.value)
    },
    [onSelect],
  )

  useEffect(() => {
    if (!selectedOptionBackgroundRef.current) return

    const background = selectedOptionBackgroundRef.current

    if (!selectedOptionButtonRef.current) {
      background.style.display = 'none'
      return
    }

    const button = selectedOptionButtonRef.current

    const updateBackgroundPosition = () => {
      background.style.top = `${button.offsetTop}px`
      background.style.left = `${button.offsetLeft}px`
      background.style.width = `${button.offsetWidth}px`
      background.style.display = 'block'
    }

    updateBackgroundPosition()

    const resizeObserver = new ResizeObserver(updateBackgroundPosition)
    resizeObserver.observe(button)

    return () => resizeObserver.disconnect()
  }, [selected])

  return (
    <div
      className={cn(
        'flex flex-row h-11 pb-1 bg-secondary rounded-xl border border-border',
        fullWidth ? 'w-full' : 'w-fit',
      )}
    >
      <div
        className={cn(
          'flex flex-row justify-between gap-2 ',
          'bg-secondary rounded-xl border border-border',
          'relative -m-px p-1',
          {
            'w-[calc(100%+2px)]': fullWidth,
          },
        )}
      >
        <div
          className={cn(
            'h-8', // Button normal size height
            'absolute hidden bg-background rounded-lg border border-border',
            '-m-px p-1 gap-2 transition-all duration-200 ease-in-out',
          )}
          ref={selectedOptionBackgroundRef}
        />
        {options.map((option, idx) => {
          return (
            <Fragment key={idx}>
              {Array.isArray(option) ? (
                <ItemOptionGroup
                  showSelectedOnSubroutes={showSelectedOnSubroutes}
                  group={option}
                  selected={selected}
                  selectedOptionButtonRef={selectedOptionButtonRef}
                  handleSelect={handleSelect}
                  fullWidth={fullWidth}
                  disabled={disabled}
                  linkWrapper={linkWrapper}
                />
              ) : (
                <ItemOption
                  showSelectedOnSubroutes={showSelectedOnSubroutes}
                  option={option}
                  selected={selected}
                  selectedOptionButtonRef={selectedOptionButtonRef}
                  handleSelect={handleSelect}
                  fullWidth={fullWidth}
                  disabled={disabled || option.disabled}
                  linkWrapper={linkWrapper}
                />
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
