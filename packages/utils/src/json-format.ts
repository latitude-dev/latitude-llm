/**
 * Upper bound on part text length that the GenAI conversation UI will try to
 * render as Markdown. Beyond this, the UI falls back to a plain-text preview
 * and annotation anchors cannot capture `pretty-json` offsets. Lives here
 * because the same threshold gates JSON-prettify detection.
 */
export const LARGE_MARKDOWN_CONTENT_THRESHOLD = 20_000

export function isJsonBlock(content: string): boolean {
  const t = content.trim()
  if (t.length < 2) return false
  const first = t[0]
  const last = t[t.length - 1]
  if (!((first === "{" && last === "}") || (first === "[" && last === "]"))) return false
  try {
    JSON.parse(t)
    return true
  } catch {
    return false
  }
}

/**
 * Decide which text-format transform the GenAI conversation UI will apply
 * when it renders `rawText` as an assistant part. Returns `"pretty-json"`
 * when the part is JSON small enough to prettify, `undefined` otherwise.
 * Used by the frontend to stamp annotation anchors so backend resolvers can
 * replay the same transform before slicing.
 */
export function detectPartTextFormat(rawText: string): "pretty-json" | undefined {
  if (rawText.length > LARGE_MARKDOWN_CONTENT_THRESHOLD) return undefined
  if (!isJsonBlock(rawText)) return undefined
  return "pretty-json"
}

/**
 * Reformat compact (single-line) JSON so nested structures render with
 * indentation. Already-multiline JSON is kept verbatim so any producer-side
 * formatting (and annotation offsets saved against it) is preserved.
 */
export function prettifyCompactJson(content: string): string {
  if (content.includes("\n")) return content
  try {
    return JSON.stringify(JSON.parse(content), null, 2)
  } catch {
    return content
  }
}

/**
 * Apply the transform named by `textFormat` to `rawText`. Returns `rawText`
 * unchanged when `textFormat` is undefined or the content cannot be formatted
 * (e.g. `pretty-json` on a non-JSON string). This is the single source of
 * truth for how an annotation anchor's offsets are aligned against part text.
 */
export function formatPartText(rawText: string, textFormat: "pretty-json" | undefined): string {
  if (textFormat === "pretty-json") {
    return prettifyCompactJson(rawText)
  }
  return rawText
}
