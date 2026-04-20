import { common, createLowlight } from "lowlight"

/**
 * Shared `lowlight` instance used for syntax highlighting. Loads the `common`
 * language subset (JSON, JS/TS, Python, CSS, HTML, etc.) — covers the
 * languages assistants most often emit without pulling in all 190+ grammars.
 */
export const lowlight = createLowlight(common)

interface HighlightedToken {
  text: string
  sourceStart: number
  sourceEnd: number
  /** Joined `hljs-*` classes inherited from every ancestor element. */
  hljsClass: string | null
}

type HastLike = {
  type: string
  value?: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastLike[]
}

function classNamesOf(node: HastLike): string[] {
  const raw = node.properties?.className
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter((c): c is string => typeof c === "string")
  if (typeof raw === "string") return raw.split(/\s+/).filter(Boolean)
  return []
}

/**
 * Walk a lowlight HAST tree depth-first and flatten it to a list of leaf text
 * tokens, each carrying its source offsets and the joined `hljs-*` classes
 * inherited from its ancestor spans.
 *
 * Invariant: the concatenated `text` values of the returned tokens, in order,
 * equal the original source passed to `lowlight.highlight`. This is what
 * lets `JsonContent` preserve the 1:1 DOM↔source byte mapping that the
 * annotation offsets depend on.
 */
export function flattenHighlightedTokens(root: HastLike, sourceStart: number): HighlightedToken[] {
  const tokens: HighlightedToken[] = []
  let offset = sourceStart

  const walk = (node: HastLike, inheritedClasses: string[]) => {
    if (node.type === "text") {
      const text = node.value ?? ""
      if (text.length === 0) return
      tokens.push({
        text,
        sourceStart: offset,
        sourceEnd: offset + text.length,
        hljsClass: inheritedClasses.length > 0 ? inheritedClasses.join(" ") : null,
      })
      offset += text.length
      return
    }

    const nextClasses = node.type === "element" ? [...inheritedClasses, ...classNamesOf(node)] : inheritedClasses

    for (const child of node.children ?? []) {
      walk(child, nextClasses)
    }
  }

  walk(root as HastLike, [])
  return tokens
}
