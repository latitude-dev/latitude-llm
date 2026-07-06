import { describe, expect, it } from "vitest"
import { absolutizeUrl, toChangelogEntry } from "./reader.ts"
import type { ChangelogApiEntry } from "./response-schema.ts"

const sampleEntry: ChangelogApiEntry = {
  id: "make-datasets-across-latitude",
  slug: "make-datasets-across-latitude",
  url: "/changelog/make-datasets-across-latitude",
  title: "Make Datasets Across Latitude",
  version: "make-datasets-across-latitude",
  pubDate: "2026-06-26T00:00:00.000Z",
  description: "You can now send any session directly to a dataset.",
  type: "minor",
  image: "/latitude-assets/example.gif",
  imageAlt: null,
  body: "Full markdown body",
}

describe("absolutizeUrl", () => {
  it("prefixes relative paths with the base URL", () => {
    expect(absolutizeUrl("https://latitude.so", "/api/changelog.json")).toBe("https://latitude.so/api/changelog.json")
  })

  it("returns absolute URLs unchanged", () => {
    expect(absolutizeUrl("https://latitude.so", "https://example.com/page")).toBe("https://example.com/page")
  })
})

describe("toChangelogEntry", () => {
  it("maps API entries into domain entities with absolute URLs", () => {
    const entry = toChangelogEntry(sampleEntry, "https://latitude.so")
    expect(entry).toEqual({
      id: "make-datasets-across-latitude",
      slug: "make-datasets-across-latitude",
      url: "https://latitude.so/changelog/make-datasets-across-latitude",
      title: "Make Datasets Across Latitude",
      summary: "You can now send any session directly to a dataset.",
      category: "minor",
      coverUrl: "https://latitude.so/latitude-assets/example.gif",
      publishedAt: new Date("2026-06-26T00:00:00.000Z"),
    })
  })

  it("returns null for invalid pubDate values", () => {
    expect(toChangelogEntry({ ...sampleEntry, pubDate: "not-a-date" }, "https://latitude.so")).toBeNull()
  })

  it("maps empty description and image to null fields", () => {
    const entry = toChangelogEntry({ ...sampleEntry, description: "", type: "", image: null }, "https://latitude.so")
    expect(entry?.summary).toBeNull()
    expect(entry?.category).toBeNull()
    expect(entry?.coverUrl).toBeNull()
  })
})
