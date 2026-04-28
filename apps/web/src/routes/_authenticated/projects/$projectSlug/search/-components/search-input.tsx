import { Icon, Input } from "@repo/ui"
import { SearchIcon } from "lucide-react"
import type { Ref } from "react"

const SEARCH_QUERY_MAX_LENGTH = 500

interface SearchInputProps {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly onSubmit: (value: string) => void
  readonly onFocus?: () => void
  readonly inputRef?: Ref<HTMLInputElement>
  readonly autoFocus?: boolean
}

export function SearchInput({ value, onChange, onSubmit, onFocus, inputRef, autoFocus }: SearchInputProps) {
  return (
    <div className="relative flex-1">
      <div className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center">
        <Icon icon={SearchIcon} size="sm" color="foregroundMuted" />
      </div>
      <Input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => onFocus?.()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            onSubmit(value.trim().slice(0, SEARCH_QUERY_MAX_LENGTH))
          }
        }}
        placeholder="Search"
        size="lg"
        maxLength={SEARCH_QUERY_MAX_LENGTH}
        className="w-full pl-9"
        autoFocus={autoFocus}
      />
    </div>
  )
}
