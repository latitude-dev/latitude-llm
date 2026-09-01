import { describe, expect, it } from "vitest"
import { distanceToTableBottom, externalScrollMargin } from "./infinite-table.tsx"

describe("externalScrollMargin", () => {
  it("includes sibling content above the table inside a shared scroll container", () => {
    expect(
      externalScrollMargin({
        containerTop: 100,
        containerScrollTop: 240,
        wrapperTop: 460,
      }),
    ).toBe(600)
  })

  it("updates when content above the table changes the wrapper offset", () => {
    const before = externalScrollMargin({
      containerTop: 100,
      containerScrollTop: 240,
      wrapperTop: 460,
    })
    const after = externalScrollMargin({
      containerTop: 100,
      containerScrollTop: 240,
      wrapperTop: 520,
    })

    expect(after - before).toBe(60)
  })
})

describe("distanceToTableBottom", () => {
  it("loads more when the table bottom nears the container viewport", () => {
    expect(
      distanceToTableBottom({
        containerBottom: 800,
        tableBottom: 930,
      }),
    ).toBe(130)
  })

  it("ignores sibling content rendered after the table", () => {
    expect(
      distanceToTableBottom({
        containerBottom: 800,
        tableBottom: 760,
      }),
    ).toBe(-40)
  })
})
