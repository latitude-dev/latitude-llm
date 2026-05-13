import { useMountEffect } from "@repo/ui"
import { useRef, useState } from "react"

type SearchSegmentKind = "semantic" | "literal" | "token"

type SearchSegment = {
  readonly id: string
  readonly kind: SearchSegmentKind
  readonly text: string
}

let nextSearchSegmentId = 0

export function createSearchSegment(kind: SearchSegmentKind, text = ""): SearchSegment {
  nextSearchSegmentId += 1
  return { id: `search-segment-${nextSearchSegmentId.toString()}`, kind, text }
}

export function delimiterForKind(kind: SearchSegmentKind): '"' | "`" | "" {
  if (kind === "literal") return '"'
  if (kind === "token") return "`"
  return ""
}

export function kindForDelimiter(delimiter: string): SearchSegmentKind | undefined {
  if (delimiter === '"') return "literal"
  if (delimiter === "`") return "token"
  return undefined
}

export function parseSearchSegments(value: string): readonly SearchSegment[] {
  const segments: SearchSegment[] = []
  let buffer = ""
  let i = 0

  const flushSemantic = () => {
    const text = buffer.trim()
    if (text.length === 0) {
      buffer = ""
      return
    }
    segments.push(createSearchSegment("semantic", text))
    buffer = ""
  }

  while (i < value.length) {
    const delimiter = value[i]!
    const kind = kindForDelimiter(delimiter)
    if (!kind) {
      buffer += delimiter
      i += 1
      continue
    }

    const close = value.indexOf(delimiter, i + 1)
    if (close === -1) {
      buffer += value.slice(i)
      break
    }

    flushSemantic()
    segments.push(createSearchSegment(kind, value.slice(i + 1, close)))
    i = close + 1
  }

  flushSemantic()
  return segments.length > 0 ? segments : [createSearchSegment("semantic")]
}

export function serializeSearchSegments(segments: readonly SearchSegment[]): string {
  return segments
    .map((segment) => {
      if (segment.kind === "semantic") return segment.text
      const delimiter = delimiterForKind(segment.kind)
      return `${delimiter}${segment.text}${delimiter}`
    })
    .join("")
}

export function serializeSearchSegmentsWithinLimit(segments: readonly SearchSegment[], maxLength: number): string {
  let remaining = maxLength
  const parts: string[] = []

  for (const segment of segments) {
    if (remaining <= 0) break

    if (segment.kind === "semantic") {
      const text = segment.text.slice(0, remaining)
      parts.push(text)
      remaining -= text.length
      continue
    }

    if (remaining < 2) break

    const delimiter = delimiterForKind(segment.kind)
    const text = segment.text.slice(0, remaining - 2)
    parts.push(`${delimiter}${text}${delimiter}`)
    remaining -= text.length + 2
  }

  return parts.join("")
}

export function splitSegmentOnDelimiter(segment: SearchSegment, value: string): readonly SearchSegment[] {
  if (segment.kind !== "semantic") return [{ ...segment, text: value }]
  if (!value.includes('"') && !value.includes("`")) return [{ ...segment, text: value }]

  return parseSearchSegments(value)
}

export function useSearchSegments(initialValue: string, onSubmit: (value: string) => void, maxLength = 500) {
  const [segments, setSegments] = useState(() => parseSearchSegments(initialValue))
  const inputRefs = useRef(new Map<string, HTMLInputElement>())

  const registerInput = (id: string) => (node: HTMLInputElement | null) => {
    if (node) inputRefs.current.set(id, node)
    else inputRefs.current.delete(id)
  }

  const focusSegment = (id: string, position: "start" | "end" = "end") => {
    window.setTimeout(() => {
      const input = inputRefs.current.get(id)
      const cursor = position === "start" ? 0 : input?.value.length
      input?.focus()
      if (cursor !== undefined) input?.setSelectionRange(cursor, cursor)
    }, 0)
  }

  useMountEffect(() => {
    const first = segments[0]
    if (first) focusSegment(first.id)
  })

  const submit = (nextSegments = segments) => {
    const serialized = serializeSearchSegments(nextSegments).trim()
    const next =
      serialized.length <= maxLength ? serialized : serializeSearchSegmentsWithinLimit(nextSegments, maxLength).trim()
    onSubmit(next)
  }

  const updateSegment = (segment: SearchSegment, value: string) => {
    const replacement = splitSegmentOnDelimiter(segment, value)
    setSegments((current) => current.flatMap((item) => (item.id === segment.id ? replacement : [item])))
    const focusTarget = replacement[replacement.length - 1]
    if (focusTarget && focusTarget.id !== segment.id) focusSegment(focusTarget.id)
  }

  const openPill = (segment: SearchSegment, delimiter: '"' | "`", input: HTMLInputElement) => {
    const kind = kindForDelimiter(delimiter)
    if (!kind) return

    const start = input.selectionStart ?? segment.text.length
    const end = input.selectionEnd ?? start
    const before = segment.text.slice(0, start).trimEnd()
    const selected = segment.text.slice(start, end)
    const after = segment.text.slice(end).trimStart()
    const pill = createSearchSegment(kind, selected)
    const replacement = [
      ...(before.length > 0 ? [{ ...segment, text: before }] : []),
      pill,
      ...(after.length > 0 ? [createSearchSegment("semantic", after)] : []),
    ]

    setSegments((current) => current.flatMap((item) => (item.id === segment.id ? replacement : [item])))
    focusSegment(pill.id)
  }

  const closePill = (segment: SearchSegment) => {
    const nextSemantic = createSearchSegment("semantic")
    setSegments((current) => {
      const index = current.findIndex((item) => item.id === segment.id)
      if (index === -1) return current
      return [...current.slice(0, index + 1), nextSemantic, ...current.slice(index + 1)]
    })
    focusSegment(nextSemantic.id)
  }

  const removeSegment = (segment: SearchSegment, allowKeepingSingleSemantic = false) => {
    setSegments((current) => {
      const index = current.findIndex((item) => item.id === segment.id)
      if (index === -1) return current

      if (current.length === 1) {
        if (segment.kind === "semantic" && allowKeepingSingleSemantic) return current
        const next = createSearchSegment("semantic")
        focusSegment(next.id)
        return [next]
      }

      const next = current.filter((item) => item.id !== segment.id)
      const focusTarget = next[Math.max(0, index - 1)] ?? next[0]
      if (focusTarget) focusSegment(focusTarget.id)
      return next
    })
  }

  const focusSearchEnd = () => {
    const last = segments[segments.length - 1]
    if (!last) return
    if (last.kind === "semantic") {
      focusSegment(last.id)
      return
    }

    const next = createSearchSegment("semantic")
    setSegments((current) => [...current, next])
    focusSegment(next.id)
  }

  const focusAdjacentSegment = (segment: SearchSegment, direction: "previous" | "next") => {
    const index = segments.findIndex((item) => item.id === segment.id)
    const focusTarget = direction === "previous" ? segments[index - 1] : segments[index + 1]
    if (!focusTarget) return
    focusSegment(focusTarget.id, direction === "previous" ? "end" : "start")
  }

  return {
    segments,
    registerInput,
    focusSegment,
    submit,
    updateSegment,
    openPill,
    closePill,
    removeSegment,
    focusSearchEnd,
    focusAdjacentSegment,
  }
}
