import { javascript } from "@codemirror/lang-javascript"
import { json } from "@codemirror/lang-json"
import type { Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"

export function isJson(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length === 0) return false
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return false
  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}

export function languageSupport(language: string | undefined, isJsonContent: boolean): Extension | null {
  if (isJsonContent || language?.toLowerCase() === "json") return json()
  if (!language) return null

  const lang = language.toLowerCase()
  if (lang === "tsx") {
    return javascript({ jsx: true, typescript: true })
  }
  if (lang === "ts" || lang === "typescript") {
    return javascript({ typescript: true })
  }
  if (lang === "jsx") {
    return javascript({ jsx: true })
  }
  if (lang === "js" || lang === "javascript") {
    return javascript()
  }

  return null
}

// Makes the editor fill a height-bounded parent so the scroller (not the page) scrolls.
export const fillHeightTheme = EditorView.theme({
  "&": { height: "100%" },
})

export const readonlyTheme = EditorView.theme({
  "&": {
    fontSize: "12px",
    fontFamily: "var(--font-mono)",
    color: "hsl(var(--foreground))",
  },
  ".cm-content": {
    padding: "8px 0",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "1px solid hsl(var(--border))",
    color: "hsl(var(--muted-foreground))",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    overflow: "auto",
  },
  ".cm-cursor, .cm-dropCursor": {
    display: "none !important",
  },
})
