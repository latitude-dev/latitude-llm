import type { SearchEntityType } from "@domain/admin"
import { Icon, type TabOption, Tabs } from "@repo/ui"
import { SearchIcon } from "lucide-react"
import { type Dispatch, type KeyboardEvent, type RefObject, type SetStateAction, useEffect, useRef } from "react"

const entityTabs: readonly TabOption<SearchEntityType>[] = [
  { id: "all", label: "All" },
  { id: "user", label: "Users" },
  { id: "organization", label: "Organizations" },
  { id: "project", label: "Projects" },
]

export interface OmniboxProps {
  readonly value: string
  readonly onChange: Dispatch<SetStateAction<string>>
  readonly entityType: SearchEntityType
  readonly onEntityTypeChange: Dispatch<SetStateAction<SearchEntityType>>
  /**
   * Container that wraps the result rows. When the user presses ↓ from
   * the input we focus the first `<a>` inside this container, and ↑
   * from the first row returns focus to the input. Letting the consumer
   * pass the ref keeps the omnibox component decoupled from the
   * results layout — it doesn't need to know what's rendered below.
   */
  readonly resultsContainerRef: RefObject<HTMLDivElement | null>
}

/**
 * Spotlight-style omnibox.
 *
 * Visual identity is deliberately quiet: a single oversized centered
 * input with a leading search icon and entity-type tabs as filter
 * chips below. The page chrome around it is empty so the input itself
 * is the only thing competing for attention — typical of
 * command-palette / Spotlight UIs (Linear, Raycast, GitHub
 * command bar).
 *
 * Keyboard ergonomics:
 * - Input autofocuses on mount.
 * - `↓` from the input moves focus to the first result row.
 * - `↑` from the first row returns focus to the input.
 * - `↑/↓` between rows walks the list (browser-default focus
 *   behaviour on `<a>` elements after we override the keydown).
 * - `Enter` on a focused row activates the link (browser default —
 *   no extra wiring).
 * - `Esc` from any focused row returns to the input. `Esc` from the
 *   input clears the query.
 *
 * Focus management uses DOM querying (`querySelectorAll('a')` inside
 * the results container) rather than a ref array — the row components
 * stay focus-management-agnostic, which keeps them reusable on
 * detail pages where this navigation doesn't apply.
 */
export function Omnibox({ value, onChange, entityType, onEntityTypeChange, resultsContainerRef }: OmniboxProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const focusFirstResult = () => {
    const first = resultsContainerRef.current?.querySelector<HTMLAnchorElement>("a")
    first?.focus()
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      focusFirstResult()
      return
    }
    if (event.key === "Escape" && value.length > 0) {
      event.preventDefault()
      onChange("")
    }
  }

  // Bubble-phase keydown listener on the results container so we can
  // intercept arrow / escape on whichever row currently has focus,
  // without forcing every row component to wire up its own handler.
  // Capture-phase isn't necessary — rows are anchors and don't have
  // their own keydown handlers, so there's nothing for us to outrun.
  useEffect(() => {
    const container = resultsContainerRef.current
    if (!container) return

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "Escape") return

      const target = event.target
      if (!(target instanceof HTMLAnchorElement)) return

      const rows = Array.from(container.querySelectorAll<HTMLAnchorElement>("a"))
      const index = rows.indexOf(target)
      if (index === -1) return

      if (event.key === "Escape") {
        event.preventDefault()
        inputRef.current?.focus()
        return
      }

      if (event.key === "ArrowDown") {
        event.preventDefault()
        const next = rows[Math.min(index + 1, rows.length - 1)]
        next?.focus()
        return
      }

      // ArrowUp
      event.preventDefault()
      if (index === 0) {
        inputRef.current?.focus()
        return
      }
      rows[index - 1]?.focus()
    }

    container.addEventListener("keydown", onKeyDown)
    return () => container.removeEventListener("keydown", onKeyDown)
  }, [resultsContainerRef])

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full">
        <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
          <Icon icon={SearchIcon} size="default" color="foregroundMuted" />
        </div>
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Search users, organizations, or projects…"
          // The placeholder reads as the input's purpose to sighted
          // users; `aria-label` mirrors it for assistive tech, since
          // there's no visible `<label>` to associate with.
          aria-label="Search backoffice"
          maxLength={100}
          // Suppress browser autocomplete / autocorrect / capitalisation —
          // staff are typing emails, slugs, ids; the browser's guesses are
          // always wrong.
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className={[
            "w-full rounded-xl border border-border bg-background py-4 pl-12 pr-4 text-base",
            "shadow-sm placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
            "transition-shadow",
          ].join(" ")}
        />
      </div>
      <Tabs variant="bordered" size="sm" options={entityTabs} active={entityType} onSelect={onEntityTypeChange} />
    </div>
  )
}
