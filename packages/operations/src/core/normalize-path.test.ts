import { describe, expect, it } from "vitest"
import { honoPathToOpenApi } from "./normalize-path.ts"

describe("honoPathToOpenApi", () => {
  it("converts a single :param to {param}", () => {
    expect(honoPathToOpenApi("/projects/:projectSlug/annotations")).toBe("/projects/{projectSlug}/annotations")
  })

  it("converts multiple :params on the same path", () => {
    expect(honoPathToOpenApi("/projects/:projectSlug/datasets/:datasetSlug/rows")).toBe(
      "/projects/{projectSlug}/datasets/{datasetSlug}/rows",
    )
  })

  it("leaves the path untouched when it has no params", () => {
    expect(honoPathToOpenApi("/api-keys")).toBe("/api-keys")
    expect(honoPathToOpenApi("/")).toBe("/")
    expect(honoPathToOpenApi("")).toBe("")
  })

  it("is idempotent on already-OpenAPI-form paths", () => {
    const openApi = "/projects/{projectSlug}/annotations"
    expect(honoPathToOpenApi(openApi)).toBe(openApi)
    expect(honoPathToOpenApi(honoPathToOpenApi(openApi))).toBe(openApi)
  })

  it("terminates the param name at the first non-identifier character", () => {
    // `-`, `.`, `/`, etc. end the param — matching Hono's own parameter grammar.
    expect(honoPathToOpenApi("/a/:id-suffix")).toBe("/a/{id}-suffix")
    expect(honoPathToOpenApi("/a/:id.json")).toBe("/a/{id}.json")
    expect(honoPathToOpenApi("/a/:id/b")).toBe("/a/{id}/b")
  })

  it("accepts underscore-leading and underscore-containing names", () => {
    expect(honoPathToOpenApi("/a/:_internal/b")).toBe("/a/{_internal}/b")
    expect(honoPathToOpenApi("/a/:my_param/b")).toBe("/a/{my_param}/b")
  })

  it("does not strip a leading colon from a non-identifier (e.g. `:0xyz` is invalid Hono syntax)", () => {
    expect(honoPathToOpenApi("/a/:0bad")).toBe("/a/:0bad")
  })
})
