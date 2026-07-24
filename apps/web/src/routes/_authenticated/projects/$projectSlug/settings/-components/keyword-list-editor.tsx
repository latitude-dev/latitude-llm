import { Badge, Button, Icon, Text } from "@repo/ui"
import { X } from "lucide-react"
import { useState } from "react"

/**
 * A free-text keyword chip editor for the GitHub magic-words lists: Enter or
 * comma commits the draft, Backspace on an empty draft removes the last chip,
 * and duplicates are dropped case-insensitively. Validation (length, charset,
 * slug-shape, count) is enforced by the domain schema on submit; `error` shows
 * the resulting field message.
 */
export function KeywordListEditor({
  label,
  value,
  onChange,
  error,
  onReset,
}: {
  label: string
  value: readonly string[]
  onChange: (next: string[]) => void
  error?: string | undefined
  onReset?: () => void
}) {
  const [draft, setDraft] = useState("")

  const addKeyword = (raw: string) => {
    const keyword = raw.trim().replace(/\s+/g, " ")
    setDraft("")
    if (keyword.length === 0) return
    if (value.some((existing) => existing.toLowerCase() === keyword.toLowerCase())) return
    onChange([...value, keyword])
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-row items-center justify-between gap-2">
        <Text.H6 weight="medium">{label}</Text.H6>
        {onReset ? (
          <Button variant="link" size="sm" onClick={onReset}>
            Reset to defaults
          </Button>
        ) : null}
      </div>
      <div className="flex flex-row flex-wrap items-center gap-1.5 rounded-md border border-border p-2">
        {value.map((keyword) => (
          <Badge key={keyword} variant="muted" size="normal">
            <span className="truncate">{keyword}</span>
            <button
              type="button"
              aria-label={`Remove ${keyword}`}
              className="ml-1 cursor-pointer rounded-sm opacity-70 hover:opacity-100"
              onClick={() => onChange(value.filter((existing) => existing !== keyword))}
            >
              <Icon icon={X} size="xs" />
            </button>
          </Badge>
        ))}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault()
              addKeyword(draft)
            } else if (event.key === "Backspace" && draft.length === 0 && value.length > 0) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={() => addKeyword(draft)}
          placeholder={value.length === 0 ? "Add a keyword…" : ""}
          className="min-w-[8rem] flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      {error ? <Text.H6 color="destructive">{error}</Text.H6> : null}
    </div>
  )
}
