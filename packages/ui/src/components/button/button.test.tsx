import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Button } from "./button.tsx"

describe("Button", () => {
  it("does not force type button by default", () => {
    const markup = renderToStaticMarkup(<Button>Submit</Button>)

    expect(markup).not.toContain('type="button"')
  })

  it("forwards explicit type attribute", () => {
    const markup = renderToStaticMarkup(<Button type="submit">Submit</Button>)

    expect(markup).toContain('type="submit"')
  })
})

/** `max-w-full` contains `w-full` as a substring, so width assertions need whole classes. */
const widthClasses = (markup: string): string[] =>
  (markup.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/).filter((name) => name === "w-full" || name === "w-auto")

describe("Button asChild width", () => {
  it("shrinks to its content rather than inheriting the inner element's w-full", () => {
    const markup = renderToStaticMarkup(
      <Button asChild>
        <a href="/somewhere">Connect</a>
      </Button>,
    )

    expect(widthClasses(markup)).toEqual(["w-auto"])
  })

  it("stays full width when the size asks for it", () => {
    const markup = renderToStaticMarkup(
      <Button asChild size="full">
        <a href="/somewhere">Connect</a>
      </Button>,
    )

    expect(widthClasses(markup)).toEqual(["w-full"])
  })

  it("keeps the fixed square width of an icon size", () => {
    for (const size of ["icon", "icon-xs"] as const) {
      const markup = renderToStaticMarkup(
        <Button asChild size={size}>
          <a href="/somewhere">x</a>
        </Button>,
      )

      expect(widthClasses(markup)).toEqual([])
      expect(markup).toMatch(size === "icon" ? /\bw-8\b/ : /\bw-5\b/)
    }
  })

  it("lets a caller override the width", () => {
    const markup = renderToStaticMarkup(
      <Button asChild className="w-full">
        <a href="/somewhere">Connect</a>
      </Button>,
    )

    expect(widthClasses(markup)).toEqual(["w-full"])
  })
})
