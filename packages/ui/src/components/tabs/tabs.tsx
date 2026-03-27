import { cva, type VariantProps } from "class-variance-authority"
import { type KeyboardEvent, type ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { cn } from "../../utils/cn.ts"
import { Text } from "../text/text.tsx"
import { Tooltip } from "../tooltip/tooltip.tsx"

const tabsListVariants = cva("relative flex flex-row gap-2", {
  variants: {
    variant: {
      secondary: "",
      bordered: "w-fit rounded-lg border border-border bg-secondary p-1",
    },
  },
  defaultVariants: {
    variant: "secondary",
  },
})

const tabTriggerVariants = cva(
  "relative z-10 inline-flex items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background cursor-pointer",
  {
    variants: {
      variant: {
        secondary: "text-xs leading-4 font-medium",
        bordered: "border border-transparent bg-transparent",
      },
      hideLabels: {
        true: "h-8 w-8",
        false: "h-8 gap-1 px-2",
      },
      active: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      {
        variant: "secondary",
        hideLabels: true,
        active: false,
        className: "text-muted-foreground hover:bg-muted",
      },
      {
        variant: "secondary",
        hideLabels: false,
        active: true,
        className: "text-foreground",
      },
      {
        variant: "secondary",
        hideLabels: false,
        active: false,
        className: "text-muted-foreground hover:bg-muted",
      },
      {
        variant: "bordered",
        hideLabels: true,
        active: true,
        className: "text-foreground",
      },
      {
        variant: "bordered",
        hideLabels: true,
        active: false,
        className: "text-muted-foreground hover:bg-background/60",
      },
      {
        variant: "bordered",
        hideLabels: false,
        active: true,
        className: "text-foreground",
      },
      {
        variant: "bordered",
        hideLabels: false,
        active: false,
        className: "text-muted-foreground hover:bg-background/60",
      },
    ],
    defaultVariants: {
      variant: "secondary",
      hideLabels: false,
      active: false,
    },
  },
)

const tabIndicatorVariants = cva("pointer-events-none absolute left-0 top-0 rounded-md", {
  variants: {
    variant: {
      secondary: "bg-muted",
      bordered: "border border-border bg-background",
    },
  },
  defaultVariants: {
    variant: "secondary",
  },
})

export type TabOption<T extends string = string> = {
  readonly id: T
  readonly label: string
  readonly icon?: ReactNode
  /** Extra content appended to the tab's tooltip (e.g. a HotkeyBadge). When hideLabels is true the label is automatically prepended. */
  readonly tooltip?: ReactNode
}

export type TabsProps<T extends string = string> = {
  readonly options: readonly TabOption<T>[]
  readonly active: T
  readonly onSelect: (id: T) => void
  readonly hideLabels?: boolean
} & VariantProps<typeof tabsListVariants>

type SlidingIndicatorParams<T extends string> = {
  readonly active: T
  readonly options: readonly TabOption<T>[]
  readonly variant: Exclude<TabsProps<T>["variant"], null | undefined>
}

function useSlidingIndicator<T extends string>({ active, options, variant }: SlidingIndicatorParams<T>) {
  const listRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Map<T, HTMLButtonElement>>(new Map())
  const indicatorRef = useRef<HTMLDivElement>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const hasPositionedRef = useRef(false)
  const [isIndicatorVisible, setIsIndicatorVisible] = useState(false)
  const [isIndicatorAnimated, setIsIndicatorAnimated] = useState(false)

  const setTabRef = useCallback((id: T, element: HTMLButtonElement | null) => {
    if (element) {
      tabRefs.current.set(id, element)
      return
    }

    tabRefs.current.delete(id)
  }, [])

  const updateIndicator = useCallback(() => {
    const listElement = listRef.current
    const indicatorElement = indicatorRef.current
    const activeTabElement = tabRefs.current.get(active)

    if (!listElement || !indicatorElement || !activeTabElement) {
      setIsIndicatorVisible(false)
      return
    }

    const listRect = listElement.getBoundingClientRect()
    const tabRect = activeTabElement.getBoundingClientRect()
    const x = tabRect.left - listRect.left - listElement.clientLeft
    const y = tabRect.top - listRect.top - listElement.clientTop

    indicatorElement.style.transform = `translate(${x}px, ${y}px)`
    indicatorElement.style.width = `${tabRect.width}px`
    indicatorElement.style.height = `${tabRect.height}px`

    if (!hasPositionedRef.current) {
      hasPositionedRef.current = true
      setIsIndicatorVisible(true)

      animationFrameRef.current = requestAnimationFrame(() => {
        setIsIndicatorAnimated(true)
      })

      return
    }

    setIsIndicatorVisible(true)
  }, [active])

  useLayoutEffect(() => {
    updateIndicator()

    resizeObserverRef.current?.disconnect()

    const resizeObserver = new ResizeObserver(() => {
      updateIndicator()
    })

    resizeObserverRef.current = resizeObserver

    const listElement = listRef.current
    if (listElement) {
      resizeObserver.observe(listElement)
    }

    for (const option of options) {
      const tabElement = tabRefs.current.get(option.id)
      if (tabElement) {
        resizeObserver.observe(tabElement)
      }
    }

    return () => {
      resizeObserver.disconnect()
      resizeObserverRef.current = null
    }
  }, [options, updateIndicator, variant])

  useMountEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect()

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  })

  return {
    indicatorRef,
    isIndicatorAnimated,
    isIndicatorVisible,
    listRef,
    setTabRef,
    tabRefs,
  }
}

export function Tabs<T extends string>({
  options,
  active,
  onSelect,
  hideLabels = false,
  variant = "secondary",
}: TabsProps<T>) {
  const { indicatorRef, isIndicatorAnimated, isIndicatorVisible, listRef, setTabRef, tabRefs } = useSlidingIndicator({
    active,
    options,
    variant: variant ?? "secondary",
  })

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const currentIndex = options.findIndex((o) => o.id === active)
      let nextIndex: number | undefined

      switch (e.key) {
        case "ArrowLeft":
          nextIndex = (currentIndex - 1 + options.length) % options.length
          break
        case "ArrowRight":
          nextIndex = (currentIndex + 1) % options.length
          break
        case "Home":
          nextIndex = 0
          break
        case "End":
          nextIndex = options.length - 1
          break
        default:
          return
      }

      e.preventDefault()
      const next = options[nextIndex]
      if (!next) return
      onSelect(next.id)
      tabRefs.current.get(next.id)?.focus()
    },
    [options, active, onSelect],
  )

  return (
    <div className={cn(tabsListVariants({ variant }))} role="tablist" onKeyDown={onKeyDown} ref={listRef}>
      <div
        aria-hidden="true"
        className={cn(tabIndicatorVariants({ variant }), {
          hidden: !isIndicatorVisible,
          "transition-[transform,width,height] duration-200 ease-in-out": isIndicatorAnimated,
        })}
        ref={indicatorRef}
      />
      {options.map((option) => {
        const isActive = active === option.id
        const trigger = (
          <button
            key={option.id}
            ref={(el) => setTabRef(option.id, el)}
            role="tab"
            type="button"
            aria-selected={isActive}
            aria-label={hideLabels ? option.label : undefined}
            tabIndex={isActive ? 0 : -1}
            className={cn(tabTriggerVariants({ variant, active: isActive, hideLabels }))}
            onClick={() => onSelect(option.id)}
          >
            {hideLabels ? (
              <>
                <span className="sr-only">{option.label}</span>
                {option.icon}
              </>
            ) : (
              <>
                {option.icon}
                <Text.H5 color={isActive ? "foreground" : "foregroundMuted"}>{option.label}</Text.H5>
              </>
            )}
          </button>
        )

        if (hideLabels) {
          return (
            <Tooltip key={option.id} trigger={trigger} asChild>
              {option.tooltip ? (
                <>
                  {option.label} {option.tooltip}
                </>
              ) : (
                <Text.H6>{option.label}</Text.H6>
              )}
            </Tooltip>
          )
        }

        if (option.tooltip) {
          return (
            <Tooltip key={option.id} trigger={trigger} asChild>
              {option.tooltip}
            </Tooltip>
          )
        }

        return trigger
      })}
    </div>
  )
}
