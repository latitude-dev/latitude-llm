import { flattenHighlightedTokens, lowlight } from "../genai-conversation/parts/syntax-highlight.ts"

export interface LineToken {
  readonly text: string
  /** Column offset of this token within its line. */
  readonly start: number
  readonly hljsClass: string | null
}

const HLJS_LANGUAGE: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  javascript: "javascript",
  ts: "typescript",
  tsx: "typescript",
  typescript: "typescript",
  json: "json",
}

function resolveLanguage(language: string | undefined): string | null {
  if (!language) return null
  const name = HLJS_LANGUAGE[language.toLowerCase()] ?? language.toLowerCase()
  return lowlight.registered(name) ? name : null
}

/**
 * Syntax-highlight `source` and bucket the tokens into lines, so a unified diff
 * can render each line independently while keeping cross-line grammar context.
 * Line partitioning mirrors the diff model's (`\n`-split, trailing newline is a
 * terminator not a line), so `lines[n]` lines up with a row's line number − 1.
 */
export function highlightToLines(source: string, language: string | undefined): LineToken[][] {
  const name = resolveLanguage(language)
  const tokens: Array<{ text: string; hljsClass: string | null }> = name
    ? flattenHighlightedTokens(lowlight.highlight(name, source), 0)
    : [{ text: source, hljsClass: null }]

  const lines: LineToken[][] = [[]]
  let column = 0
  for (const token of tokens) {
    const segments = token.text.split("\n")
    for (let s = 0; s < segments.length; s++) {
      if (s > 0) {
        lines.push([])
        column = 0
      }
      const text = segments[s]!
      if (text.length === 0) continue
      lines[lines.length - 1]!.push({ text, start: column, hljsClass: token.hljsClass })
      column += text.length
    }
  }

  if (source.endsWith("\n") && lines[lines.length - 1]!.length === 0) {
    lines.pop()
  }
  return lines
}
