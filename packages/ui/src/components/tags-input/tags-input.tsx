import { X } from "lucide-react"
import { type ReactNode, useId, useState } from "react"

import { cn } from "../../utils/cn.ts"
import { Badge } from "../badge/index.tsx"
import { FormField } from "../form-field/form-field.tsx"
import { Icon } from "../icons/icons.tsx"

export interface TagsInputProps {
  readonly value: readonly string[]
  readonly onChange: (next: string[]) => void
  readonly label?: ReactNode
  readonly description?: ReactNode
  readonly errors?: string[] | undefined
  readonly placeholder?: string
  readonly disabled?: boolean
  readonly className?: string
}

const SEPARATORS = /[,\n\t]+/

/**
 * Free-text chip editor: Enter or comma commits the draft, pasting a delimited
 * list commits every entry at once, Backspace on an empty draft removes the last
 * chip, and duplicates are dropped case-insensitively. Values are kept as typed —
 * validation belongs to whatever schema the form submits to, surfaced via `errors`.
 */
export function TagsInput({
  value,
  onChange,
  label,
  description,
  errors,
  placeholder,
  disabled = false,
  className,
}: TagsInputProps) {
  const [draft, setDraft] = useState("")
  const inputId = useId()
  const hasErrors = errors !== undefined && errors.length > 0

  const commit = (raw: string) => {
    setDraft("")
    const added: string[] = []
    for (const entry of raw.split(SEPARATORS)) {
      const tag = entry.trim().replace(/\s+/g, " ")
      if (tag.length === 0) continue
      if ([...value, ...added].some((existing) => existing.toLowerCase() === tag.toLowerCase())) continue
      added.push(tag)
    }
    if (added.length > 0) onChange([...value, ...added])
  }

  return (
    <FormField label={label} description={description} errors={errors} className={className} controlId={inputId}>
      {/* Clicking anywhere in the box focuses the draft input, the way the chips box looks like it should. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: focus forwarding for the input it wraps */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the wrapped input is the keyboard target */}
      <div
        onClick={(event) => {
          if (event.target === event.currentTarget) document.getElementById(inputId)?.focus()
        }}
        className="flex flex-row flex-wrap items-center gap-1.5 rounded-md border border-input p-2 focus-within:ring-1 focus-within:ring-ring"
      >
        {value.map((tag) => (
          <Badge key={tag} variant="muted" size="normal">
            <span className="truncate">{tag}</span>
            {disabled ? null : (
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                className="ml-1 cursor-pointer rounded-sm opacity-70 hover:opacity-100"
                onClick={() => onChange(value.filter((existing) => existing !== tag))}
              >
                <Icon icon={X} size="xs" />
              </button>
            )}
          </Badge>
        ))}
        <input
          id={inputId}
          aria-describedby={
            [description ? `${inputId}-description` : null, hasErrors ? `${inputId}-error` : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
          aria-invalid={hasErrors || undefined}
          disabled={disabled}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault()
              commit(draft)
            } else if (event.key === "Backspace" && draft.length === 0 && value.length > 0) {
              onChange(value.slice(0, -1))
            }
          }}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text")
            if (!SEPARATORS.test(pasted)) return
            event.preventDefault()
            commit(draft + pasted)
          }}
          onBlur={() => commit(draft)}
          placeholder={disabled || value.length > 0 ? "" : placeholder}
          className={cn(
            "min-w-[8rem] flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground",
            { "cursor-not-allowed": disabled },
          )}
        />
      </div>
    </FormField>
  )
}
