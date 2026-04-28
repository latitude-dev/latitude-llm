import { useState } from "react"
import { useDebounce } from "react-use"
import { useTraceDistinctValues } from "../../../../../../domains/traces/traces.collection.ts"

const MIN_TOKEN_LENGTH = 2

interface TagSuggestion {
  readonly fullTag: string
  readonly typedWord: string
  readonly suffix: string
}

/**
 * Splits the trailing whitespace-delimited word from the draft. The "word" is
 * what we try to match against tags; the "prefix" is what stays unchanged when
 * the suggestion is accepted.
 */
export function splitTrailingWord(draft: string): { prefix: string; word: string } {
  const idx = draft.lastIndexOf(" ")
  if (idx < 0) return { prefix: "", word: draft }
  return { prefix: draft.slice(0, idx + 1), word: draft.slice(idx + 1) }
}

export function useTagSuggestion({
  projectId,
  draft,
  excludeTags,
}: {
  readonly projectId: string
  readonly draft: string
  readonly excludeTags: readonly string[]
}): TagSuggestion | null {
  const { word } = splitTrailingWord(draft)
  const [debouncedSearch, setDebouncedSearch] = useState("")

  useDebounce(
    () => {
      setDebouncedSearch(word.length >= MIN_TOKEN_LENGTH ? word : "")
    },
    250,
    [word],
  )

  const { data = [] } = useTraceDistinctValues({
    projectId,
    column: "tags",
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  })

  if (word.length < MIN_TOKEN_LENGTH) return null
  if (!debouncedSearch) return null

  const lowerWord = word.toLowerCase()
  const excluded = new Set(excludeTags)
  const match = data.find((tag) => tag.toLowerCase().startsWith(lowerWord) && !excluded.has(tag))
  if (!match) return null
  if (match.toLowerCase() === lowerWord) return null

  return {
    fullTag: match,
    typedWord: word,
    suffix: match.slice(word.length),
  }
}
