import { LARGE_MARKDOWN_CONTENT_THRESHOLD } from "@repo/utils"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { MarkdownContent } from "./markdown-content.tsx"

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

    for (const cls of [
      "not-prose",
      "bg-muted",
      "rounded-lg",
      "overflow-hidden",
      "whitespace-pre-wrap",
      "p-3",
      "text-xs",
    ]) {
      expect(jsonMarkup).toContain(cls)
      expect(fencedMarkup).toContain(cls)
    }
  })

  it("wraps tables in a horizontally scrollable container so they never overflow the drawer", () => {
    const table = "| a | b |\n| - | - |\n| 1 | 2 |"
    const markup = renderToStaticMarkup(<MarkdownContent content={table} />)

    // The <table> must be nested inside an overflow-x-auto wrapper so wide
    // tables scroll horizontally within the message instead of pushing the
    // surrounding layout past the drawer width.
    expect(markup).toMatch(/<div[^>]*\boverflow-x-auto\b[^>]*>\s*<table\b/)
  })

  it("splits oversized content into head + collapsed middle + tail rendered as Markdown", () => {
    const head = "# Head heading\n\n"
    const filler = "a".repeat(LARGE_MARKDOWN_CONTENT_THRESHOLD)
    const tail = "\n\n## Tail heading END_MARKER"
    const oversizedContent = `${head}${filler}${tail}`

    const markup = renderToStaticMarkup(<MarkdownContent content={oversizedContent} />)

    // Head and tail are rendered as Markdown.
    expect(markup).toContain("Head heading")
    expect(markup).toContain("Tail heading")
    expect(markup).toContain("END_MARKER")
    expect(markup).toContain("<h1")
    expect(markup).toContain("<h2")
    // The collapsed middle exposes a "Show … more characters" affordance,
    // and the middle bytes themselves are NOT in the initial markup.
    expect(markup).toMatch(/Show [\d,]+ more characters/)
  })

  // Text with no `data-source-*` cannot be annotated: the popover opens, then the thumb click resolves to no anchor.
  describe("source coverage", () => {
    function sourceSpans(markup: string, content: string) {
      return [...markup.matchAll(/data-source-start="(\d+)" data-source-end="(\d+)"/g)].map(([, start, end]) =>
        content.slice(Number(start), Number(end)),
      )
    }

    it("keeps offsets on both sides of a soft line break", () => {
      const content = "line one\nline two"
      const markup = renderToStaticMarkup(<MarkdownContent content={content} />)

      expect(markup).toContain("<br/>")
      expect(sourceSpans(markup, content)).toEqual(["line one", "line two"])
    })

    it("maps every line of a multi-line paragraph", () => {
      const content = "Heyyy this is a test.\nName: Ada\nRole: engineer"
      const markup = renderToStaticMarkup(<MarkdownContent content={content} />)

      expect(sourceSpans(markup, content)).toEqual(["Heyyy this is a test.", "Name: Ada", "Role: engineer"])
    })

    it("maps raw HTML blocks, which render as escaped text", () => {
      const content = "<system-reminder>\nbe brief\n</system-reminder>\n\nAfter"
      const markup = renderToStaticMarkup(<MarkdownContent content={content} />)

      expect(sourceSpans(markup, content)).toEqual(["<system-reminder>\nbe brief\n</system-reminder>", "After"])
    })
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

  it("does not route oversized JSON through JsonContent (falls through to the Markdown split fallback)", () => {
    const filler = `"x": "${"a".repeat(LARGE_MARKDOWN_CONTENT_THRESHOLD)}"`
    const oversizedJson = `{${filler}}`

    const markup = renderToStaticMarkup(<MarkdownContent content={oversizedJson} />)

    expect(markup).not.toContain('data-content-type="json"')
    expect(markup).toMatch(/Show [\d,]+ more characters/)
  })

  describe("redaction placeholders", () => {
    it("renders a placeholder as a chip carrying its category, not the raw string", () => {
      const markup = renderToStaticMarkup(<MarkdownContent content="Contact [REDACTED_EMAIL] for access." />)

      expect(textContentOf(markup)).not.toContain("[REDACTED_EMAIL]")
      expect(textContentOf(markup)).toContain("EMAIL")
      expect(markup).toContain("font-mono")
    })

    it("keeps the prose around the chip intact", () => {
      const markup = renderToStaticMarkup(<MarkdownContent content="Contact [REDACTED_EMAIL] for access." />)

      expect(textContentOf(markup)).toContain("Contact ")
      expect(textContentOf(markup)).toContain(" for access.")
    })

    it("opens underscores in the label so it reads as words", () => {
      const markup = renderToStaticMarkup(<MarkdownContent content="ssn [REDACTED_US_SSN] end" />)

      expect(textContentOf(markup)).toContain("US SSN")
    })

    // Offsets after a chip must still address the original string, or search
    // highlighting in the same message lands on the wrong characters.
    it("keeps source offsets addressing the original content after a chip", () => {
      const content = "before [REDACTED_EMAIL] after"
      const markup = renderToStaticMarkup(<MarkdownContent content={content} />)

      const spans = [...markup.matchAll(/data-source-start="(\d+)" data-source-end="(\d+)"/g)]
      expect(spans.length).toBeGreaterThan(0)
      for (const [, start, end] of spans) {
        const slice = content.slice(Number(start), Number(end))
        expect(content).toContain(slice)
      }
      const lastEnd = Math.max(...spans.map(([, , end]) => Number(end)))
      expect(lastEnd).toBe(content.length)
    })

    it("leaves the literal placeholder alone inside a code fence", () => {
      const fenced = '```json\n{"email":"[REDACTED_EMAIL]"}\n```'
      const markup = renderToStaticMarkup(<MarkdownContent content={fenced} />)

      expect(textContentOf(markup)).toContain("[REDACTED_EMAIL]")
    })

    it("chips an oversized-field placeholder too", () => {
      const markup = renderToStaticMarkup(<MarkdownContent content="output [REDACTED_OVERSIZED_FIELD] end" />)

      expect(textContentOf(markup)).toContain("OVERSIZED FIELD")
      expect(textContentOf(markup)).not.toContain("[REDACTED_OVERSIZED_FIELD]")
    })

    it("makes the chip keyboard reachable and names the explanation for screen readers", () => {
      const markup = renderToStaticMarkup(<MarkdownContent content="Contact [REDACTED_EMAIL] now." />)

      expect(markup).toContain("<button")
      expect(markup).toMatch(/aria-label="[^"]*cannot be recovered/)
    })

    it("does not chip a bare [REDACTED] with no category", () => {
      const markup = renderToStaticMarkup(<MarkdownContent content="value [REDACTED] here" />)

      expect(textContentOf(markup)).toContain("[REDACTED] here")
    })
  })
})
