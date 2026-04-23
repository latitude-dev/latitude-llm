import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { LARGE_MARKDOWN_CONTENT_THRESHOLD, MarkdownContent } from "./markdown-content.tsx"

/** Strip HTML tags and decode the handful of entities we actually produce. */
function textContentOf(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
}

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
    // Compact JSON is pretty-printed with 2-space indent, and the DOM text
    // matches the prettified string verbatim (the invariant that annotation
    // offsets depend on holds against that string).
    expect(textContentOf(markup)).toBe(JSON.stringify(JSON.parse(json), null, 2))
    // Must NOT go through Markdown: no <p>, no <strong>.
    expect(markup).not.toContain("<p>")
  })

  it("routes JSON array content to the JSON code-block renderer", () => {
    const json = "[1,2,3]"
    const markup = renderToStaticMarkup(<MarkdownContent content={json} />)

    expect(markup).toContain('data-content-type="json"')
    expect(textContentOf(markup)).toBe(JSON.stringify(JSON.parse(json), null, 2))
  })

  it("keeps already-multiline JSON verbatim so producer formatting is preserved", () => {
    const json = '{\n  "a": 1\n}'
    const markup = renderToStaticMarkup(<MarkdownContent content={json} />)

    expect(markup).toContain('data-content-type="json"')
    expect(textContentOf(markup)).toBe(json)
    expect(markup).toContain(`data-source-start="0"`)
    expect(markup).toContain(`data-source-end="${json.length}"`)
  })

  it("pretty-prints compact JSON so offsets index into the reformatted content", () => {
    const json = '{ "a": 1 }'
    const pretty = JSON.stringify(JSON.parse(json), null, 2)
    const markup = renderToStaticMarkup(<MarkdownContent content={json} />)

    // Offsets start at 0 and the final segment reaches the prettified length.
    expect(markup).toContain(`data-source-start="0"`)
    expect(markup).toContain(`data-source-end="${pretty.length}"`)
  })

  it("applies JSON syntax highlighting to JsonContent", () => {
    const json = '{"k":"v","n":42,"b":true}'
    const markup = renderToStaticMarkup(<MarkdownContent content={json} />)

    // lowlight emits `hljs-attr` for JSON keys, `hljs-string` for strings,
    // `hljs-number` for numbers, `hljs-literal` for true/false/null.
    expect(markup).toContain("hljs-attr")
    expect(markup).toContain("hljs-string")
    expect(markup).toContain("hljs-number")
    expect(markup).toContain("hljs-literal")
  })

  it("preserves source-offset coverage through the full JSON after tokenization", () => {
    const json = '{"key":"value"}'
    const pretty = JSON.stringify(JSON.parse(json), null, 2)
    const markup = renderToStaticMarkup(<MarkdownContent content={json} />)

    // All source offsets together should cover the full prettified content:
    // first starts at 0 and the last one ends at pretty.length.
    const starts = [...markup.matchAll(/data-source-start="(\d+)"/g)].map((m) => Number(m[1]))
    const ends = [...markup.matchAll(/data-source-end="(\d+)"/g)].map((m) => Number(m[1]))
    expect(Math.min(...starts)).toBe(0)
    expect(Math.max(...ends)).toBe(pretty.length)
  })

  it("applies syntax highlighting to Markdown code fences", () => {
    const fenced = "```js\nconst x = 1\n```"
    const markup = renderToStaticMarkup(<MarkdownContent content={fenced} />)

    // `rehype-highlight` adds the `hljs` class to the code element plus token
    // classes for identifiers and numbers in the JS grammar.
    expect(markup).toMatch(/class="[^"]*\bhljs\b/)
    expect(markup).toMatch(/class="[^"]*hljs-(keyword|number|variable|title)/)
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
    const filler = `"x": "${"a".repeat(LARGE_MARKDOWN_CONTENT_THRESHOLD)}"`
    const oversizedJson = `{${filler}}`

    const markup = renderToStaticMarkup(<MarkdownContent content={oversizedJson} />)

    expect(markup).toContain("This content is too large to render as Markdown safely")
    expect(markup).not.toContain('data-content-type="json"')
  })
})
