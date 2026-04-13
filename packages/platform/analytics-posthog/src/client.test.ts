import { describe, expect, it } from "vitest"
import { createPostHogClient } from "./client.ts"

describe("createPostHogClient", () => {
  it("returns a no-op client when config is undefined", async () => {
    const client = createPostHogClient(undefined)

    // None of these should throw or make network calls.
    await expect(client.capture({ distinctId: "d", event: "e", properties: {}, groups: {} })).resolves.toBeUndefined()
    await expect(
      client.groupIdentify({ groupType: "organization", groupKey: "o", properties: {} }),
    ).resolves.toBeUndefined()
    await expect(client.shutdown()).resolves.toBeUndefined()
  })
})
