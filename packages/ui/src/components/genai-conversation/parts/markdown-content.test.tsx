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

  it("routes Markdown code fences through the shared code-block shell", () => {
    const fenced = "```js\nconst x = 1\n```"
    const markup = renderToStaticMarkup(<MarkdownContent content={fenced} />)

    // Shared shell classes applied to the <pre> that wraps the fence.
    expect(markup).toContain("<pre")
    expect(markup).toContain("not-prose")
    expect(markup).toContain("bg-muted")
    expect(markup).toContain("rounded-lg")
    // Inner <code> still carries the fence language class from remark-gfm.
    expect(markup).toContain("language-js")
  })

  it("JSON and Markdown code fences share the same shell classes", () => {
    const jsonContent = '{"a":1}'
    const fencedContent = "```js\nconst a = 1\n```"
    const jsonMarkup = renderToStaticMarkup(<MarkdownContent content={jsonContent} />)
    const fencedMarkup = renderToStaticMarkup(<MarkdownContent content={fencedContent} />)

    for (const cls of ["not-prose", "bg-muted", "rounded-lg", "overflow-auto", "p-3", "text-xs"]) {
      expect(jsonMarkup).toContain(cls)
      expect(fencedMarkup).toContain(cls)
    }
  })

  it("falls back to a guarded plain-text view for oversized content", () => {
    const oversizedContent = `${"a".repeat(LARGE_MARKDOWN_CONTENT_THRESHOLD + 1)}END_MARKER`

    const markup = renderToStaticMarkup(<MarkdownContent content={oversizedContent} />)

    expect(markup).toContain("This content is too large to render as Markdown safely")
    expect(markup).not.toContain("Render markdown anyway")
    expect(markup).not.toContain("END_MARKER")
  })

  it("routes JSON object content to the JSON code-block renderer", () => {
    const json = '{"hello":"world","n":42}'
    const markup = renderToStaticMarkup(<MarkdownContent content={json} />)

    expect(markup).toContain('data-content-type="json"')
    expect(markup).toContain("data-source-start")
    expect(markup).toContain("data-source-end")
    expect(markup).toContain("&quot;hello&quot;")
    // Must NOT go through Markdown: no <p>, no <strong>.
    expect(markup).not.toContain("<p>")
  })

  it("routes JSON array content to the JSON code-block renderer", () => {
    const json = "[1,2,3]"
    const markup = renderToStaticMarkup(<MarkdownContent content={json} />)

    expect(markup).toContain('data-content-type="json"')
    expect(markup).toContain("[1,2,3]")
  })

  it("renders verbatim: JSON offsets index into the original content", () => {
    const json = '{ "a": 1 }'
    const markup = renderToStaticMarkup(<MarkdownContent content={json} />)

    // Single unhighlighted span should cover the whole content range 0..length.
    expect(markup).toContain(`data-source-start="0"`)
    expect(markup).toContain(`data-source-end="${json.length}"`)
  })

  it("does not route JSON-looking-but-invalid content to JsonContent", () => {
    const notJson = "{ not actually json }"
    const markup = renderToStaticMarkup(<MarkdownContent content={notJson} />)

    expect(markup).not.toContain('data-content-type="json"')
  })

  it("does not route non-JSON Markdown to JsonContent", () => {
    const markup = renderToStaticMarkup(<MarkdownContent content="**bold**" />)

    expect(markup).not.toContain('data-content-type="json"')
    expect(markup).toContain("<strong>")
  })

  it("falls back to plain-text preview for oversized JSON instead of JsonContent", () => {
    const filler = '"x": "' + "a".repeat(LARGE_MARKDOWN_CONTENT_THRESHOLD) + '"'
    const oversizedJson = `{${filler}}`

    const markup = renderToStaticMarkup(<MarkdownContent content={oversizedJson} />)

    expect(markup).toContain("This content is too large to render as Markdown safely")
    expect(markup).not.toContain('data-content-type="json"')
  })
})
