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
