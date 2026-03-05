"use client"

import { Fragment, type ReactNode, type Ref, type RefObject, useCallback, useEffect, useRef, useState } from "react"

import { cn } from "../../utils/cn.js"
import { Button } from "../button/button.tsx"
import { Text } from "../text/text.tsx"

export type TabSelectorOption<T> = {
  label: ReactNode | string
  value: T
  route?: string
  disabled?: boolean
}

type LinkWrapper = (props: {
  children: ReactNode
  href: string
  className?: string
}) => ReactNode

function LabelText({
  isSelected,
  children,
}: {
  isSelected: boolean | undefined | null
  children: ReactNode | string
}) {
  if (typeof children === "string") {
    return (
      <Text.H5 weight="medium" color={isSelected ? "foreground" : "foregroundMuted"}>
        {children}
      </Text.H5>
    )
  }
  return <>{children}</>
}

function checkSelected<T extends string>({
  option,
  selected,
  showSelectedOnSubroutes,
}: {
  option: TabSelectorOption<T>
  selected: T | null | undefined
  showSelectedOnSubroutes: boolean
}) {
  return showSelectedOnSubroutes ? (selected?.startsWith(option.value) ?? false) : selected === option.value
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
}: {
  option: TabSelectorOption<T>
  showSelectedOnSubroutes: boolean
  selectedOptionButtonRef: RefObject<HTMLElement | null>
  selected?: T | null
  handleSelect: (option: TabSelectorOption<T>) => () => void
  fullWidth?: boolean
  disabled?: boolean
  linkWrapper: LinkWrapper | undefined
}) {
  const isSelected = checkSelected({ option, selected, showSelectedOnSubroutes })
  const Wrapper = option.route && linkWrapper ? linkWrapper : "div"
  return (
    <Wrapper className={cn("flex", fullWidth && "flex-1")} href={option.route as string}>
      <Button
        ref={isSelected ? (selectedOptionButtonRef as unknown as Ref<HTMLButtonElement>) : null}
        type="button"
        variant="ghost"
        flat
        className={cn(
          "flex w-full px-3 h-8 bg-transparent rounded-lg cursor-pointer items-center justify-center gap-1",
        )}
        onClick={handleSelect(option)}
        disabled={disabled}
      >
        <LabelText isSelected={isSelected}>{option.label}</LabelText>
      </Button>
    </Wrapper>
  )
}

export type TabSelectorProps<T extends string> = {
  options: TabSelectorOption<T>[]
  selected?: T | null
  onSelect?: (value: T) => void
  showSelectedOnSubroutes?: boolean
  fullWidth?: boolean
  disabled?: boolean
  linkWrapper?: LinkWrapper
}

function TabSelector<T extends string>({
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
  const [selected, setSelected] = useState<T | null>(originalSelected ?? null)

  useEffect(() => {
    setSelected(originalSelected ?? null)
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
      background.style.display = "none"
      return
    }

    const button = selectedOptionButtonRef.current

    const updateBackgroundPosition = () => {
      background.style.top = `${button.offsetTop}px`
      background.style.left = `${button.offsetLeft}px`
      background.style.width = `${button.offsetWidth}px`
      background.style.display = "block"
    }

    updateBackgroundPosition()

    const resizeObserver = new ResizeObserver(updateBackgroundPosition)
    resizeObserver.observe(button)

    return () => resizeObserver.disconnect()
  }, [])

  return (
    <div
      className={cn(
        "flex flex-row h-11 pb-1 bg-secondary rounded-xl border border-border",
        fullWidth ? "w-full" : "w-fit",
      )}
    >
      <div
        className={cn(
          "flex flex-row justify-between gap-2",
          "bg-secondary rounded-xl border border-border",
          "relative -m-px p-1",
          {
            "w-[calc(100%+2px)]": fullWidth,
          },
        )}
      >
        <div
          className={cn(
            "h-8",
            "absolute hidden bg-background rounded-lg border border-border",
            "-m-px p-1 gap-2 transition-all duration-200 ease-in-out",
          )}
          ref={selectedOptionBackgroundRef}
        />
        {options.map((option) => (
          <Fragment key={option.value}>
            <ItemOption
              showSelectedOnSubroutes={showSelectedOnSubroutes}
              option={option}
              selected={selected}
              selectedOptionButtonRef={selectedOptionButtonRef}
              handleSelect={handleSelect}
              fullWidth={fullWidth}
              disabled={disabled === true || option.disabled === true}
              linkWrapper={linkWrapper}
            />
          </Fragment>
        ))}
      </div>
    </div>
  )
}

export { TabSelector }
