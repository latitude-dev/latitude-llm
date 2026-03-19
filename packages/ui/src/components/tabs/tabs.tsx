import { type KeyboardEvent, type ReactNode, useCallback, useRef } from "react"
import { cn } from "../../utils/cn.ts"
import { Text } from "../text/text.tsx"

export type TabOption<T extends string = string> = {
  readonly id: T
  readonly label: string
  readonly icon?: ReactNode
}

export function Tabs<T extends string>({
  options,
  active,
  onSelect,
}: {
  readonly options: readonly TabOption<T>[]
  readonly active: T
  readonly onSelect: (id: T) => void
}) {
  const tabRefs = useRef<Map<T, HTMLButtonElement>>(new Map())

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
    <div className="flex flex-row gap-2" role="tablist" onKeyDown={onKeyDown}>
      {options.map((option) => {
        const isActive = active === option.id
        return (
          <button
            key={option.id}
            ref={(el) => {
              if (el) tabRefs.current.set(option.id, el)
              else tabRefs.current.delete(option.id)
            }}
            role="tab"
            type="button"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={cn(
              "inline-flex items-center h-8 gap-1 px-2 rounded-md",
              "text-xs leading-4 font-medium cursor-pointer",
              isActive ? "bg-muted text-foreground" : "hover:bg-muted text-muted-foreground",
            )}
            onClick={() => onSelect(option.id)}
          >
            {option.icon}
            <Text.H5 color={isActive ? "foreground" : "foregroundMuted"}>{option.label}</Text.H5>
          </button>
        )
      })}
    </div>
  )
}
