import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { LARGE_MARKDOWN_CONTENT_THRESHOLD, MarkdownContent } from "./markdown-content.tsx"

describe("MarkdownContent", () => {
  it("renders markdown normally for smaller content", () => {
    const markup = renderToStaticMarkup(<MarkdownContent content="**bold**" />)

    expect(markup).toContain("<strong>")
    expect(markup).toContain("data-source-start")
    expect(markup).toContain(">bold<")
  })

  it("falls back to a guarded plain-text view for oversized content", () => {
    const oversizedContent = `${"a".repeat(LARGE_MARKDOWN_CONTENT_THRESHOLD + 1)}END_MARKER`

    const markup = renderToStaticMarkup(<MarkdownContent content={oversizedContent} />)

    expect(markup).toContain("This content is too large to render as Markdown safely")
    expect(markup).not.toContain("Render markdown anyway")
    expect(markup).not.toContain("END_MARKER")
  })
})
